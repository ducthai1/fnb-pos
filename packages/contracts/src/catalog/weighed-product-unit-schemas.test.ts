import { describe, expect, it } from "vitest";
import { posProductSchema } from "../pos/pos-product-schema";
import { refusedPathsOf } from "../zod-issue-test-helpers";
import { productDocumentSchema } from "./product-document-schema";
import { productDocumentToDomain } from "./product-document-to-domain";

const BRAND = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";

const beans = {
  version: null,
  brandId: BRAND,
  kind: "retail_item",
  name: "Cà phê hạt Robusta",
  basePrice: 32_000,
  pricingMode: "weighed",
  measureUnit: "100g",
};

const tillCopy = {
  id: BRAND,
  version: 4,
  brandId: BRAND,
  categoryId: null,
  stationId: null,
  kind: "retail_item",
  name: "Cà phê hạt Robusta",
  basePrice: 32_000,
  pricingMode: "weighed",
  taxRate: 0,
  trackStock: false,
  earnsPoints: true,
  printCupLabel: false,
  variants: [],
  modifierGroups: [],
  combo: null,
};

describe("what a weighed product's price is per, in the contracts", () => {
  it("carries the unit of a saved product to the domain, and none when left out", () => {
    expect(productDocumentToDomain(BRAND, productDocumentSchema.parse(beans)).measureUnit).toBe(
      "100g",
    );
    const fixed: Record<string, unknown> = { ...beans, pricingMode: "fixed" };
    delete fixed.measureUnit;
    expect(productDocumentSchema.parse(fixed).measureUnit).toBeNull();
  });

  it("refuses a unit no till knows how to weigh in", () => {
    for (const measureUnit of ["lb", "g", "100 g", 1000]) {
      expect(refusedPathsOf(productDocumentSchema, { ...beans, measureUnit })).toEqual([
        "measureUnit",
      ]);
      expect(refusedPathsOf(posProductSchema, { ...tillCopy, measureUnit })).toEqual([
        "measureUnit",
      ]);
    }
  });

  it("reads a till's copy from before units as one without a unit", () => {
    expect(posProductSchema.parse(tillCopy).measureUnit).toBeNull();
    expect(posProductSchema.parse({ ...tillCopy, measureUnit: "kg" }).measureUnit).toBe("kg");
  });
});
