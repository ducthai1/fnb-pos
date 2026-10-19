import { describe, expect, it } from "vitest";
import { errorOf } from "../catalog/catalog-test-helpers";
import { vnd } from "../money";
import type { PriceListItem } from "./price-list-types";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { fixedPrice, priceListItem, priceOf } from "./pricing-test-helpers";
import { validatePriceListItem } from "./validate-price-list-item";

const item = (overrides: Partial<PriceListItem>) => priceListItem({ id: "item", ...overrides });
const codeFor = (overrides: Partial<PriceListItem>) =>
  errorOf(() => validatePriceListItem(item(overrides))).code;
const accepts = (overrides: Partial<PriceListItem>) =>
  expect(() => validatePriceListItem(item(overrides))).not.toThrow();

describe("validatePriceListItem", () => {
  it("accepts a fixed price on a variant or a product, including a free one", () => {
    accepts({ scope: { kind: "variant", variantId: "size-m" }, effect: fixedPrice(30_000) });
    accepts({ scope: { kind: "product", productId: "pearl-milk-tea" }, effect: fixedPrice(0) });
  });

  it("rejects a fixed price for a whole category or the whole menu", () => {
    const error = errorOf(() =>
      validatePriceListItem(
        item({ scope: { kind: "category", categoryId: "milk-tea" }, effect: fixedPrice(30_000) }),
      ),
    );
    expect(error.code).toBe(PRICING_ERROR_CODES.fixedPriceOnBroadScope);
    expect(error.details).toMatchObject({ priceListItemId: "item", scope: "category" });
    expect(codeFor({ scope: { kind: "global" }, effect: fixedPrice(30_000) })).toBe(
      PRICING_ERROR_CODES.fixedPriceOnBroadScope,
    );
  });

  it("rejects a negative fixed price", () => {
    const negative = { kind: "fixed_price", price: vnd(-1) } as const;
    expect(codeFor({ scope: { kind: "product", productId: "p" }, effect: negative })).toBe(
      PRICING_ERROR_CODES.negativeFixedPrice,
    );
  });

  it("accepts validFrom before validTo and rejects an empty or reversed range", () => {
    accepts({ validFrom: 1_000, validTo: 1_001 });
    accepts({ validFrom: null, validTo: 1_000 });
    expect(codeFor({ validFrom: 1_000, validTo: 1_000 })).toBe(
      PRICING_ERROR_CODES.invalidValidityRange,
    );
    expect(codeFor({ validFrom: 2_000, validTo: 1_000 })).toBe(
      PRICING_ERROR_CODES.invalidValidityRange,
    );
    expect(codeFor({ validFrom: Number.NaN })).toBe(PRICING_ERROR_CODES.invalidValidityRange);
  });

  it("accepts days 0 to 6 and rejects an empty list or a day outside the week", () => {
    accepts({ daysOfWeek: [0, 6] });
    for (const daysOfWeek of [[], [7], [-1], [1.5]]) {
      expect(codeFor({ daysOfWeek })).toBe(PRICING_ERROR_CODES.invalidDaysOfWeek);
    }
  });

  it("accepts a window until midnight or across it and rejects a zero-length or out-of-day one", () => {
    accepts({ timeWindow: { startMinute: 1_200, endMinute: 1_440 } });
    accepts({ timeWindow: { startMinute: 1_320, endMinute: 120 } });
    for (const timeWindow of [
      { startMinute: 600, endMinute: 600 },
      { startMinute: 1_440, endMinute: 60 },
      { startMinute: 0, endMinute: 1_441 },
      { startMinute: -1, endMinute: 60 },
      { startMinute: 10.5, endMinute: 60 },
    ]) {
      expect(codeFor({ timeWindow })).toBe(PRICING_ERROR_CODES.invalidTimeWindow);
    }
  });

  it("accepts a negative whole priority and rejects a fractional one", () => {
    accepts({ priority: -5 });
    expect(codeFor({ priority: 1.5 })).toBe(PRICING_ERROR_CODES.invalidPriority);
    expect(codeFor({ priority: Number.NaN })).toBe(PRICING_ERROR_CODES.invalidPriority);
  });

  it("makes resolveUnitPrice refuse a bad item even when it would not apply to this sale", () => {
    const otherBranch = item({
      branchId: "branch-q3",
      scope: { kind: "global" },
      effect: fixedPrice(1),
    });
    const error = errorOf(() => priceOf({ priceList: [otherBranch] }));
    expect(error.code).toBe(PRICING_ERROR_CODES.fixedPriceOnBroadScope);
  });
});
