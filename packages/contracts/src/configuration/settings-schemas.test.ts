import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { closeDifferenceToleranceSettingSchema } from "./config-setting-value-schemas";
import { settingBodySchema, settingParamsSchema, settingsQuerySchema } from "./settings-schemas";

const ID = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";

describe("the settings requests", () => {
  it("name a brand, branch or till by its id", () => {
    for (const scope of ["brand", "branch", "device"]) {
      expect(outcomeOf(settingsQuerySchema, { scope, scopeId: ID }).ok).toBe(true);
    }
    expect(outcomeOf(settingsQuerySchema, { scope: "tenant", scopeId: ID }).ok).toBe(false);
    expect(outcomeOf(settingsQuerySchema, { scope: "brand", scopeId: "Q1" }).ok).toBe(false);
  });

  it("take a key spelled like the catalog spells keys, and nothing like a path", () => {
    const params = { scope: "branch", scopeId: ID, key: "charge_profile" };
    expect(outcomeOf(settingParamsSchema, params).ok).toBe(true);
    expect(outcomeOf(settingParamsSchema, { ...params, key: "__proto__" }).ok).toBe(false);
    expect(outcomeOf(settingParamsSchema, { ...params, key: "Charge-Profile" }).ok).toBe(false);
  });

  it("take a value, null included, and refuse a body without one", () => {
    expect(outcomeOf(settingBodySchema, { value: null }).ok).toBe(true);
    expect(outcomeOf(settingBodySchema, { value: false }).ok).toBe(true);
    expect(outcomeOf(settingBodySchema, {}).ok).toBe(false);
    expect(outcomeOf(settingBodySchema, { value: true, scope: "brand" }).ok).toBe(false);
  });
});

describe("closeDifferenceToleranceSettingSchema", () => {
  it("takes whole đồng as a decimal string", () => {
    expect(outcomeOf(closeDifferenceToleranceSettingSchema, "0").ok).toBe(true);
    expect(outcomeOf(closeDifferenceToleranceSettingSchema, "20000").ok).toBe(true);
  });

  it.each([
    ["a number", 20_000],
    ["a negative", "-1"],
    ["a fraction", "1.5"],
    ["a padded zero", "010"],
  ])("refuses %s", (_case, value) => {
    expect(outcomeOf(closeDifferenceToleranceSettingSchema, value).ok).toBe(false);
  });
});
