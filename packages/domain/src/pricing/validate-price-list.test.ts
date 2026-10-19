import { describe, expect, it } from "vitest";
import { errorOf } from "../catalog/catalog-test-helpers";
import { fixedPrice, priceListItem } from "./pricing-test-helpers";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { validatePriceList } from "./validate-price-list";

describe("validatePriceList", () => {
  it("accepts items with distinct ids and rejects two items sharing one", () => {
    const happyHour = priceListItem({ id: "happy-hour" });
    const grab = priceListItem({ id: "grab", channelKey: "grab" });
    expect(() => validatePriceList([happyHour, grab])).not.toThrow();
    const error = errorOf(() =>
      validatePriceList([happyHour, grab, { ...happyHour, priority: 1 }]),
    );
    expect(error.code).toBe(PRICING_ERROR_CODES.duplicatePriceListItemId);
    expect(error.details).toMatchObject({ priceListItemId: "happy-hour" });
  });

  it("checks every item on its own rules", () => {
    const broadFixed = priceListItem({ id: "menu-wide", effect: fixedPrice(20_000) });
    expect(errorOf(() => validatePriceList([priceListItem({ id: "ok" }), broadFixed])).code).toBe(
      PRICING_ERROR_CODES.fixedPriceOnBroadScope,
    );
  });

  it("accepts an empty price list", () => {
    expect(() => validatePriceList([])).not.toThrow();
  });
});
