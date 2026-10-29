import { type FeatureFlagKey, FEATURE_FLAG_KEYS, validateFlags } from "@fnb/feature-flags";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyTemplate } from "./apply-template";
import { planTemplate } from "./plan-template";
import { sameNameKey } from "./same-name-key";
import type { ShopSetup } from "./shop-template-types";
import { SHOP_TEMPLATES } from "./shop-templates";

const template = fc.constantFrom(...SHOP_TEMPLATES);
const flagKey = fc.constantFrom(...FEATURE_FLAG_KEYS);

/** Names as a shop might type them: the template's own in another spelling, and anything else. */
const name = fc.oneof(
  fc.constantFrom("Cà phê", "ca phe", "  TRÀ  ", "Bar", "bar", "Bếp nóng", "Khai vị", "Bia", "Trà sữa"),
  fc.string({ maxLength: 20 }),
);
const setup: fc.Arbitrary<ShopSetup> = fc.record({
  categoryNames: fc.array(name, { maxLength: 8 }),
  stationNames: fc.array(name, { maxLength: 5 }),
  flagsSetByShop: fc
    .array(fc.tuple(flagKey, fc.boolean()), { maxLength: 6 })
    .map((pairs) => Object.fromEntries(pairs) as Partial<Record<FeatureFlagKey, boolean>>),
});

describe("applying a shop template", () => {
  it("twice is the same as once, for any shop and any template", () => {
    fc.assert(
      fc.property(template, setup, (chosen, shop) => {
        const once = applyTemplate(chosen, shop);
        expect(applyTemplate(chosen, once)).toEqual(once);
        expect(planTemplate(chosen, once).changes).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("never removes, renames or changes anything the shop already had", () => {
    fc.assert(
      fc.property(template, setup, (chosen, shop) => {
        const after = applyTemplate(chosen, shop);
        expect(after.categoryNames.slice(0, shop.categoryNames.length)).toEqual(shop.categoryNames);
        expect(after.stationNames.slice(0, shop.stationNames.length)).toEqual(shop.stationNames);
        for (const [flag, value] of Object.entries(shop.flagsSetByShop)) {
          expect(after.flagsSetByShop[flag as FeatureFlagKey]).toBe(value);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("adds each category and station once, never one the shop has under another spelling", () => {
    fc.assert(
      fc.property(template, setup, (chosen, shop) => {
        const after = applyTemplate(chosen, shop);
        const added = (all: readonly string[], before: readonly string[]) => all.slice(before.length).map(sameNameKey);
        for (const [all, before] of [[after.categoryNames, shop.categoryNames], [after.stationNames, shop.stationNames]] as const) {
          const fresh = added(all, before);
          expect(new Set(fresh).size).toBe(fresh.length);
          expect(fresh.filter((key) => before.map(sameNameKey).includes(key))).toEqual([]);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("leaves switches that follow the catalog's rules following them", () => {
    fc.assert(
      fc.property(template, setup, (chosen, shop) => {
        fc.pre(validateFlags(shop.flagsSetByShop).length === 0);
        expect(validateFlags(applyTemplate(chosen, shop).flagsSetByShop)).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("changes nothing on a shop that already has everything", () => {
    for (const each of SHOP_TEMPLATES) {
      const full = { categoryNames: [...each.categories], stationNames: [...each.stations], flagsSetByShop: { ...each.flags } };
      expect(applyTemplate(each, full)).toEqual(full);
    }
  });
});
