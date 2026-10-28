import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MEASURE_UNITS, type MeasureUnit, type Product } from "../catalog";
import { errorOf } from "../catalog/catalog-test-helpers";
import { PEARL_MILK_TEA } from "../catalog/pearl-milk-tea-test-fixture";
import { quantity, vnd } from "../money";
import type { OrderLine } from "../order";
import { goodsLineAmounts } from "../totals/goods-line-amounts";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import {
  MAX_WEIGHED_GRAMS,
  formatGrams,
  gramsOfWeighedQuantity,
  measureUnitOf,
  weighedLineAmount,
  weighedQuantity,
} from "./weighed-quantity";

const grams = fc.integer({ min: 1, max: MAX_WEIGHED_GRAMS });
const unit = fc.constantFrom<MeasureUnit>(...MEASURE_UNITS);
const pricePerUnit = fc.bigInt({ min: 0n, max: 100_000_000n }).map(vnd);

/** A lone weighed item as the till and the server put it on an order. */
const weighedLine = (unitPrice: bigint, weight: bigint): OrderLine => ({
  id: "weighed",
  parentLineId: null,
  lineType: "item",
  productId: "strawberries",
  variantId: null,
  modifierOptionId: null,
  nameSnapshot: "Dâu tây Đà Lạt",
  unitPrice: vnd(unitPrice),
  quantity: weight as OrderLine["quantity"],
  taxRate: 0 as OrderLine["taxRate"],
  note: null,
  priceSource: "base",
  reversesLineId: null,
});

describe("weighedQuantity: grams typed into the product's unit", () => {
  it("counts 350 g as 0.35 of a kilogram and 3.5 of 100 g", () => {
    expect(weighedQuantity(350, "kg")).toBe(quantity("0.35"));
    expect(weighedQuantity(350, "100g")).toBe(quantity("3.5"));
    expect(weighedQuantity(1, "kg")).toBe(quantity("0.001"));
    expect(weighedQuantity(MAX_WEIGHED_GRAMS, "100g")).toBe(quantity("1000"));
  });

  it("refuses nothing, less than nothing, part of a gram and more than 100 kg", () => {
    expect(errorOf(() => weighedQuantity(0, "kg")).code).toBe(
      PRICING_ERROR_CODES.weightNotPositive,
    );
    expect(errorOf(() => weighedQuantity(-5, "100g")).code).toBe(
      PRICING_ERROR_CODES.weightNotPositive,
    );
    expect(errorOf(() => weighedQuantity(12.5, "kg")).code).toBe(
      PRICING_ERROR_CODES.weightNotWholeGrams,
    );
    const tooMuch = errorOf(() => weighedQuantity(MAX_WEIGHED_GRAMS + 1, "kg"));
    expect(tooMuch.code).toBe(PRICING_ERROR_CODES.weightTooLarge);
    expect(tooMuch.details).toMatchObject({ grams: 100_001, maxGrams: 100_000 });
  });

  it("reads the grams back from any weight it made, exactly", () => {
    fc.assert(
      fc.property(grams, unit, (g, u) => {
        expect(gramsOfWeighedQuantity(weighedQuantity(g, u), u)).toBe(g);
      }),
    );
  });
});

describe("gramsOfWeighedQuantity: the weight a draft line sends", () => {
  it("refuses a weight that is not whole grams of the unit", () => {
    // 3.505 × 100 g is 350.5 g; 0.0005 kg cannot even be written with three decimals.
    expect(errorOf(() => gramsOfWeighedQuantity(quantity("3.505"), "100g")).code).toBe(
      PRICING_ERROR_CODES.weightNotWholeGrams,
    );
    expect(gramsOfWeighedQuantity(quantity("3.51"), "100g")).toBe(351);
    expect(gramsOfWeighedQuantity(quantity("0.353"), "kg")).toBe(353);
  });

  it("refuses zero, a negative weight and more than 100 kg", () => {
    expect(errorOf(() => gramsOfWeighedQuantity(quantity("0"), "kg")).code).toBe(
      PRICING_ERROR_CODES.weightNotPositive,
    );
    expect(errorOf(() => gramsOfWeighedQuantity(quantity("-0.2"), "kg")).code).toBe(
      PRICING_ERROR_CODES.weightNotPositive,
    );
    expect(errorOf(() => gramsOfWeighedQuantity(quantity("100.001"), "kg")).code).toBe(
      PRICING_ERROR_CODES.weightTooLarge,
    );
  });
});

describe("weighedLineAmount: what a weighed line costs", () => {
  it("multiplies the price per unit by the weight and rounds half-up to the đồng", () => {
    expect(weighedLineAmount(vnd(200_000), weighedQuantity(353, "kg"))).toBe(70_600n);
    // 45.500 đ/kg × 0,353 kg = 16.061,5 đ: half a đồng goes up.
    expect(weighedLineAmount(vnd(45_500), weighedQuantity(353, "kg"))).toBe(16_062n);
    expect(weighedLineAmount(vnd(80_000), weighedQuantity(250, "100g"))).toBe(200_000n);
  });

  it("stays within half a đồng of the exact amount and never goes down as the weight grows", () => {
    fc.assert(
      fc.property(pricePerUnit, grams, unit, (price, g, u) => {
        const weight = weighedQuantity(g, u);
        const amount = weighedLineAmount(price, weight);
        // amount × 1000 is within 500 of price × weight (both in thousandths of a đồng); an
        // exact half goes up, so the gap is above −500 and at most +500.
        const gap = amount * 1000n - price * weight;
        expect(gap > -500n && gap <= 500n).toBe(true);
        if (g < MAX_WEIGHED_GRAMS) {
          expect(weighedLineAmount(price, weighedQuantity(g + 1, u)) >= amount).toBe(true);
        }
      }),
    );
  });

  it("is the gross the order's totals give the line, so the drawer and the cart agree", () => {
    fc.assert(
      fc.property(pricePerUnit, grams, unit, (price, g, u) => {
        const weight = weighedQuantity(g, u);
        const [line] = goodsLineAmounts([weighedLine(price, weight)]);
        expect(line?.gross).toBe(weighedLineAmount(price, weight));
      }),
    );
  });
});

describe("formatGrams", () => {
  it("groups thousands like money and keeps the unit on the same line", () => {
    expect(formatGrams(353)).toBe("353\u00a0g");
    expect(formatGrams(1_250)).toBe("1.250\u00a0g");
    expect(formatGrams(100_000)).toBe("100.000\u00a0g");
  });
});

describe("measureUnitOf", () => {
  it("names the unit of a weighed product only", () => {
    const fruit: Product = { ...PEARL_MILK_TEA, pricingMode: "weighed", measureUnit: "100g" };
    expect(measureUnitOf(fruit)).toBe("100g");
    expect(measureUnitOf({ ...fruit, measureUnit: null })).toBeNull();
    expect(measureUnitOf({ ...PEARL_MILK_TEA, measureUnit: "kg" })).toBeNull();
  });
});
