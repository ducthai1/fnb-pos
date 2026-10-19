import { type OrderChargeProfile, basisPoints } from "@fnb/domain";
import { CONFIG_SETTING_DEFAULTS } from "@fnb/feature-flags";
import { describe, expect, it } from "vitest";
import { chargeProfileFromStored, chargeProfileToSnapshot } from "./charge-profile-snapshot";
import { moneyToWire } from "./order-snapshot";

const CAFE_DEFAULT: OrderChargeProfile = { pricesIncludeTax: true, serviceCharge: null };

const withServiceCharge: OrderChargeProfile = {
  pricesIncludeTax: false,
  serviceCharge: {
    rate: basisPoints(500),
    appliesTo: ["dine_in"],
    base: "after_discount",
    taxRate: basisPoints(800),
  },
};

describe("the charge profile stored on an order", () => {
  it("reads the built-in setting as the café default", () => {
    expect(chargeProfileFromStored(CONFIG_SETTING_DEFAULTS.charge_profile)).toEqual(CAFE_DEFAULT);
  });

  it.each([
    ["the café default", CAFE_DEFAULT],
    ["a 5% dine-in service charge on prices without VAT", withServiceCharge],
  ])("reads back exactly as written: %s", (_name, profile) => {
    const stored = JSON.parse(JSON.stringify(chargeProfileToSnapshot(profile)));
    expect(chargeProfileFromStored(stored)).toEqual(profile);
  });

  it.each([
    ["no tax mode", { serviceCharge: null }],
    [
      "a fractional rate",
      { pricesIncludeTax: true, serviceCharge: { ...withServiceCharge.serviceCharge, rate: 0.5 } },
    ],
    [
      "an unknown service type",
      {
        pricesIncludeTax: true,
        serviceCharge: { ...withServiceCharge.serviceCharge, appliesTo: ["drive_through"] },
      },
    ],
  ])("refuses a damaged row rather than pricing with it: %s", (_name, stored) => {
    expect(() => chargeProfileFromStored(stored)).toThrow();
  });
});

describe("money on the wire", () => {
  it("leaves as the exact number up to the largest safe integer", () => {
    expect(moneyToWire(9_007_199_254_740_991n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(moneyToWire(-45_000n)).toBe(-45_000);
  });

  it("is refused past 2^53, where a JSON number would round it", () => {
    expect(() => moneyToWire(9_007_199_254_740_993n)).toThrow(RangeError);
  });
});
