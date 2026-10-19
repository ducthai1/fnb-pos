import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PEARL_MILK_TEA } from "../catalog/pearl-milk-tea-test-fixture";
import type { PriceListItem } from "./price-list-types";
import { fixedPrice, percentOff, priceListItem, priceOf } from "./pricing-test-helpers";

const winnerOf = (priceList: readonly PriceListItem[]) => priceOf({ priceList }).priceListItemId;

// Every item applies to a size-M milk tea at branch Q1; the least specific one carries the highest priority.
const VARIANT = priceListItem({
  id: "v",
  scope: { kind: "variant", variantId: "size-m" },
  effect: fixedPrice(30_000),
});
const PRODUCT = priceListItem({
  id: "p",
  scope: { kind: "product", productId: "pearl-milk-tea" },
  effect: fixedPrice(31_000),
  priority: 1,
});
const CATEGORY = priceListItem({
  id: "c",
  scope: { kind: "category", categoryId: "milk-tea" },
  effect: percentOff(5),
  priority: 2,
});
const GLOBAL = priceListItem({
  id: "g",
  scope: { kind: "global" },
  effect: percentOff(1),
  priority: 3,
});

describe("price list precedence", () => {
  it("prefers a variant item over product, category and global ones whatever their priority", () => {
    expect(priceOf({ priceList: [GLOBAL, CATEGORY, PRODUCT, VARIANT] })).toEqual({
      unitPrice: 30_000n,
      source: "price_list",
      priceListItemId: "v",
    });
  });

  it("falls back from product to category to global as narrower items are removed", () => {
    expect(winnerOf([GLOBAL, CATEGORY, PRODUCT])).toBe("p");
    expect(winnerOf([GLOBAL, CATEGORY])).toBe("c");
    expect(winnerOf([GLOBAL])).toBe("g");
  });

  it("applies a product item only to that product", () => {
    const peachTea = {
      ...PRODUCT,
      id: "p-peach",
      scope: { kind: "product", productId: "peach-tea" },
      priority: 9,
    } as const;
    expect(winnerOf([peachTea])).toBeNull();
    expect(winnerOf([peachTea, PRODUCT])).toBe("p");
  });

  it("applies a variant item only to that variant and a category item only to its category", () => {
    const lItem = { ...VARIANT, scope: { kind: "variant", variantId: "size-l" } } as const;
    const fruit = { ...CATEGORY, scope: { kind: "category", categoryId: "fruit" } } as const;
    expect(winnerOf([lItem, fruit])).toBeNull();
    expect(priceOf({ variantId: "size-l", priceList: [lItem, fruit] }).priceListItemId).toBe("v");
    const uncategorised = { ...PEARL_MILK_TEA, categoryId: null };
    expect(priceOf({ product: uncategorised, priceList: [CATEGORY] }).priceListItemId).toBeNull();
  });

  it("prefers an item for this branch over one for every branch, even at lower priority", () => {
    const branch = { ...CATEGORY, id: "c-q1", branchId: "branch-q1", priority: 0 };
    const anyBranch = { ...CATEGORY, id: "c-all", priority: 9 };
    expect(winnerOf([anyBranch, branch])).toBe("c-q1");
    expect(winnerOf([anyBranch])).toBe("c-all");
  });

  it("prefers an item for this channel over one for every channel, even at lower priority", () => {
    const dineIn = { ...CATEGORY, id: "c-dine-in", channelKey: "dine_in", priority: 0 };
    const anyChannel = { ...CATEGORY, id: "c-all", priority: 9 };
    expect(winnerOf([anyChannel, dineIn])).toBe("c-dine-in");
  });

  it("ranks branch before channel when each item is specific on only one", () => {
    const branchOnly = { ...CATEGORY, id: "c-branch", branchId: "branch-q1" };
    const channelOnly = { ...CATEGORY, id: "c-channel", channelKey: "dine_in" };
    expect(winnerOf([channelOnly, branchOnly])).toBe("c-branch");
  });

  it("breaks a tie on specificity by higher priority, then by the smaller id", () => {
    const low = { ...CATEGORY, id: "a-low", priority: 1 };
    const high = { ...CATEGORY, id: "z-high", priority: 2 };
    expect(winnerOf([low, high])).toBe("z-high");
    const twin = { ...CATEGORY, id: "b", priority: 2 };
    expect(winnerOf([twin, high])).toBe("b");
  });

  it("picks the same item whatever order the price list arrives in", () => {
    const items = [
      GLOBAL,
      CATEGORY,
      { ...CATEGORY, id: "c2" },
      { ...CATEGORY, id: "c3", branchId: "branch-q1" },
      { ...CATEGORY, id: "c4", branchId: "branch-q1", channelKey: "dine_in" },
      { ...CATEGORY, id: "c5", branchId: "branch-q1", channelKey: "dine_in", priority: 2 },
      { ...CATEGORY, id: "c0", branchId: "branch-q1", channelKey: "dine_in", priority: 2 },
    ];
    fc.assert(
      fc.property(fc.shuffledSubarray(items, { minLength: items.length }), (shuffled) => {
        expect(winnerOf(shuffled)).toBe("c0");
      }),
    );
  });
});
