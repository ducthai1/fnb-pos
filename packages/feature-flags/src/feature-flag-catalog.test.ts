import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_CATALOG,
  FEATURE_FLAG_KEYS,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  type FeatureFlagScope,
  featureFlagDefaults,
} from "./feature-flag-catalog";
import { validateFlags } from "./validate-flag-constraints";

/** The first chain of requirements that leads back to where it started, or null. */
function findRequiresCycle(catalog: readonly FeatureFlagDefinition[]): string[] | null {
  const byKey = new Map(catalog.map((definition) => [definition.key, definition]));
  const done = new Set<string>();
  const visit = (key: FeatureFlagKey, path: FeatureFlagKey[]): string[] | null => {
    if (path.includes(key)) return [...path.slice(path.indexOf(key)), key];
    if (done.has(key)) return null;
    for (const next of byKey.get(key)?.requires ?? []) {
      const cycle = visit(next, [...path, key]);
      if (cycle !== null) return cycle;
    }
    done.add(key);
    return null;
  };
  for (const definition of catalog) {
    const cycle = visit(definition.key, []);
    if (cycle !== null) return cycle;
  }
  return null;
}

const requiresClosure = (key: FeatureFlagKey): Set<FeatureFlagKey> => {
  const closure = new Set<FeatureFlagKey>([key]);
  for (const current of closure) {
    for (const next of FEATURE_FLAG_CATALOG.find((d) => d.key === current)?.requires ?? []) {
      closure.add(next);
    }
  }
  return closure;
};

const BREADTH: Record<FeatureFlagScope, number> = { brand: 3, branch: 2, device: 1 };

describe("the feature flag catalog", () => {
  it("declares every key exactly once, in key order", () => {
    expect(FEATURE_FLAG_CATALOG.map((definition) => definition.key)).toEqual([
      ...FEATURE_FLAG_KEYS,
    ]);
  });

  it("only refers to flags it declares, never to the flag itself", () => {
    for (const { key, requires, excludes } of FEATURE_FLAG_CATALOG) {
      for (const other of [...requires, ...excludes]) {
        expect({ key, other, known: FEATURE_FLAG_KEYS.includes(other) }).toEqual({
          key,
          other,
          known: other !== key,
        });
      }
    }
  });

  it("declares every exclusion on both sides", () => {
    for (const { key, excludes } of FEATURE_FLAG_CATALOG) {
      for (const other of excludes) {
        const back = FEATURE_FLAG_CATALOG.find((d) => d.key === other)?.excludes ?? [];
        expect({ key, other, mutual: back.includes(key) }).toEqual({ key, other, mutual: true });
      }
    }
  });

  it("has no requirement cycle, which the cycle finder would catch", () => {
    expect(findRequiresCycle(FEATURE_FLAG_CATALOG)).toBeNull();
    const looped = FEATURE_FLAG_CATALOG.map((definition) =>
      definition.key === "tables"
        ? { ...definition, requires: ["course_firing" as const] }
        : definition,
    );
    expect(findRequiresCycle(looped)).toEqual(["tables", "course_firing", "tables"]);
  });

  it("lets every flag be turned on with what it requires", () => {
    for (const key of FEATURE_FLAG_KEYS) {
      const values = Object.fromEntries([...requiresClosure(key)].map((k) => [k, true]));
      expect({ key, violations: validateFlags(values) }).toEqual({ key, violations: [] });
    }
  });

  it("never requires a flag that can be set more narrowly than the flag requiring it", () => {
    // Otherwise one till could switch the requirement off under a branch-wide flag.
    for (const { key, scope, requires } of FEATURE_FLAG_CATALOG) {
      for (const other of requires) {
        const required = FEATURE_FLAG_CATALOG.find((d) => d.key === other)!;
        expect({ key, other, ok: BREADTH[required.scope] >= BREADTH[scope] }).toEqual({
          key,
          other,
          ok: true,
        });
      }
    }
  });

  it("serves its defaults as a system layer, with only the counter till on", () => {
    expect(Object.entries(featureFlagDefaults()).filter(([, on]) => on)).toEqual([
      ["pay_first_counter", true],
    ]);
    expect(Object.keys(featureFlagDefaults())).toEqual([...FEATURE_FLAG_KEYS]);
  });
});
