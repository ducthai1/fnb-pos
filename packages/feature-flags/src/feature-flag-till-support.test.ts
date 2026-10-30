import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_KEYS } from "./feature-flag-catalog";
import {
  FEATURE_FLAG_TILL_SUPPORT,
  isFlagLockedOn,
  tillSupportOf,
} from "./feature-flag-till-support";

describe("how far the till follows each switch", () => {
  it("says so for every switch of the catalog, none left out", () => {
    expect(Object.keys(FEATURE_FLAG_TILL_SUPPORT).sort()).toEqual([...FEATURE_FLAG_KEYS].sort());
  });

  it("follows tables, cup labels, kitchen routing and happy-hour pricing", () => {
    for (const key of ["tables", "cup_labels", "kitchen_routing", "happy_hour_pricing"]) {
      expect(tillSupportOf(key)).toBe("works");
    }
  });

  it("keeps the pay-first counter on and points the e-invoice switch at its profile", () => {
    expect(isFlagLockedOn("pay_first_counter")).toBe(true);
    expect(isFlagLockedOn("tables")).toBe(false);
    expect(tillSupportOf("einvoice")).toBe("see_profile");
  });

  it("treats a key that is no catalog switch as working", () => {
    expect(tillSupportOf("void_after_sent_needs_approval")).toBe("works");
  });
});
