import { describe, expect, it } from "vitest";
import { featureFlagDefaults } from "./feature-flag-catalog";
import { FeatureFlagError } from "./feature-flag-error";
import { FEATURE_FLAGS_ERROR_CODES } from "./feature-flags-error-codes";
import { type ConfigLayers, type ConfigSource, resolveConfig } from "./resolve-inherited-config";

const SYSTEM = { cash_rounding_step: "1000", receipt_footer: "Cảm ơn quý khách" };
const LOWER: readonly ConfigSource[] = ["brand", "branch", "device"];

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof FeatureFlagError) return error.code;
    throw error;
  }
  throw new Error("expected a FeatureFlagError, but nothing was thrown");
}

describe("resolveConfig", () => {
  // Every combination of which lower layers set the key: the most specific one must win.
  const combinations = Array.from({ length: 8 }, (_, mask) =>
    LOWER.filter((_, bit) => (mask & (1 << bit)) !== 0),
  );

  const cases = combinations.map((setting) => ({ setting, label: setting.join(" + ") || "none" }));

  it.each(cases)("takes the most specific layer when set in: $label", ({ setting }) => {
    const layers: ConfigLayers = {
      system: SYSTEM,
      brand: setting.includes("brand") ? { cash_rounding_step: "500" } : { other: 1 },
      branch: setting.includes("branch") ? { cash_rounding_step: "200" } : {},
      device: setting.includes("device") ? { cash_rounding_step: "100" } : undefined,
    };
    const expected: ConfigSource = setting.at(-1) ?? "system";
    const values = { system: "1000", brand: "500", branch: "200", device: "100" };
    expect(resolveConfig("cash_rounding_step", layers)).toEqual({
      value: values[expected],
      source: expected,
    });
  });

  it("resolves each key on its own, so a device can override one key and inherit another", () => {
    const layers = {
      system: SYSTEM,
      brand: { receipt_footer: "Hẹn gặp lại" },
      device: { cash_rounding_step: "500" },
    };
    expect(resolveConfig("cash_rounding_step", layers)).toEqual({ value: "500", source: "device" });
    expect(resolveConfig("receipt_footer", layers)).toEqual({
      value: "Hẹn gặp lại",
      source: "brand",
    });
  });

  it("counts a stored null as set, and an own undefined as not set", () => {
    const layers = {
      system: SYSTEM,
      brand: { receipt_footer: null },
      device: { receipt_footer: undefined },
    };
    expect(resolveConfig("receipt_footer", layers)).toEqual({ value: null, source: "brand" });
  });

  it("never resolves a key from an object prototype", () => {
    const layers = { system: { ...SYSTEM, constructor: "declared" }, brand: {}, device: {} };
    expect(resolveConfig("constructor", layers)).toEqual({ value: "declared", source: "system" });
    expect(codeOf(() => resolveConfig("toString", layers))).toBe(
      FEATURE_FLAGS_ERROR_CODES.configKeyWithoutDefault,
    );
  });

  it("refuses a key with no system default, even when a lower layer sets it", () => {
    const layers = { system: SYSTEM, device: { cash_roundin_step: "100" } };
    expect(codeOf(() => resolveConfig("cash_roundin_step", layers))).toBe(
      FEATURE_FLAGS_ERROR_CODES.configKeyWithoutDefault,
    );
  });

  it("resolves a feature flag over the catalog defaults", () => {
    const layers = { system: featureFlagDefaults(), branch: { tables: true } };
    expect(resolveConfig("tables", layers)).toEqual({ value: true, source: "branch" });
    expect(resolveConfig("pay_first_counter", layers)).toEqual({ value: true, source: "system" });
  });
});
