import { describe, expect, it } from "vitest";
import { CONFIG_SETTING_DEFAULTS, configDefaults } from "./config-setting-defaults";
import { FEATURE_FLAG_KEYS, featureFlagDefaults } from "./feature-flag-catalog";
import { resolveConfig } from "./resolve-inherited-config";

describe("configDefaults", () => {
  it("serves every flag and every setting as the system layer", () => {
    expect(configDefaults()).toEqual({ ...featureFlagDefaults(), ...CONFIG_SETTING_DEFAULTS });
  });

  it("names no setting like a flag, which would make one of the two unreachable", () => {
    const settings: readonly string[] = Object.keys(CONFIG_SETTING_DEFAULTS);
    expect(FEATURE_FLAG_KEYS.filter((key) => settings.includes(key))).toEqual([]);
  });

  it("prices a new order with VAT included and no service charge unless a shop says otherwise", () => {
    expect(resolveConfig("charge_profile", { system: configDefaults() })).toEqual({
      value: { pricesIncludeTax: true, serviceCharge: null },
      source: "system",
    });
  });

  it("lets a branch replace the whole profile, which the branch's tills then use", () => {
    const branch = {
      charge_profile: {
        pricesIncludeTax: false,
        serviceCharge: { rate: 500, appliesTo: ["dine_in"], base: "after_discount", taxRate: 800 },
      },
    };
    expect(resolveConfig("charge_profile", { system: configDefaults(), branch })).toEqual({
      value: branch.charge_profile,
      source: "branch",
    });
  });

  it("has no bank account to show a QR for until the shop sets one, which tills then inherit", () => {
    const system = configDefaults();
    const account = { bankBin: "970436", accountNumber: "0011001234567", accountName: "PHO SANG" };
    expect(resolveConfig("payment_account", { system }).value).toBeNull();
    expect(
      resolveConfig("payment_account", { system, brand: { payment_account: account } }),
    ).toEqual({
      value: account,
      source: "brand",
    });
  });

  it("issues no invoice until a branch sets its profile, which a brand-level one also gives", () => {
    const system = configDefaults();
    const profile = { enabled: true, sellerTaxCode: "0312345678" };
    expect(resolveConfig("einvoice_profile", { system }).value).toBeNull();
    expect(
      resolveConfig("einvoice_profile", { system, brand: { einvoice_profile: profile } }),
    ).toEqual({ value: profile, source: "brand" });
  });

  it("asks for an approver before cancelling what the kitchen has, unless a branch turns it off", () => {
    const system = configDefaults();
    const off = { void_after_sent_needs_approval: false };
    expect(resolveConfig("void_after_sent_needs_approval", { system }).value).toBe(true);
    expect(resolveConfig("void_after_sent_needs_approval", { system, branch: off }).value).toBe(
      false,
    );
  });
});
