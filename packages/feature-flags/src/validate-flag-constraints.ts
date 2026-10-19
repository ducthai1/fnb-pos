import {
  FEATURE_FLAG_CATALOG,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
} from "./feature-flag-catalog";
import { FEATURE_FLAGS_ERROR_CODES as CODES } from "./feature-flags-error-codes";

export type FlagViolation =
  | { readonly code: typeof CODES.unknownFlag; readonly flag: string }
  | { readonly code: typeof CODES.notBoolean; readonly flag: FeatureFlagKey }
  | {
      readonly code: typeof CODES.requiresMissing | typeof CODES.excludesBothOn;
      readonly flag: FeatureFlagKey;
      readonly other: FeatureFlagKey;
    };

/**
 * Every rule the given flag values break, in catalog order; empty means the combination is
 * valid. Flags left out take their default, so a partial set is judged as it would run.
 * Values come from stored configuration, hence `unknown`: a string "false" is reported
 * rather than read as on. A pair that excludes each other is reported once.
 */
export function validateFlags(
  values: Readonly<Record<string, unknown>>,
  catalog: readonly FeatureFlagDefinition[] = FEATURE_FLAG_CATALOG,
): FlagViolation[] {
  const known = new Map(catalog.map((definition) => [definition.key as string, definition]));
  const violations: FlagViolation[] = [];
  const on = new Set<string>();
  for (const definition of catalog) {
    const given = Object.hasOwn(values, definition.key) ? values[definition.key] : undefined;
    if (given !== undefined && typeof given !== "boolean") {
      violations.push({ code: CODES.notBoolean, flag: definition.key });
    }
    if (given === true || (given === undefined && definition.default)) on.add(definition.key);
  }
  const reportedPairs = new Set<string>();
  for (const definition of catalog) {
    if (!on.has(definition.key)) continue;
    for (const other of definition.requires) {
      if (!on.has(other)) {
        violations.push({ code: CODES.requiresMissing, flag: definition.key, other });
      }
    }
    for (const other of definition.excludes) {
      const pair = [definition.key, other].sort().join("|");
      if (on.has(other) && !reportedPairs.has(pair)) {
        reportedPairs.add(pair);
        violations.push({ code: CODES.excludesBothOn, flag: definition.key, other });
      }
    }
  }
  for (const key of Object.keys(values).sort()) {
    if (!known.has(key)) violations.push({ code: CODES.unknownFlag, flag: key });
  }
  return violations;
}
