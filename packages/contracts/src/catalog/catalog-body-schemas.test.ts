import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { availabilityBodySchema } from "./availability-schema";
import { categoryBodySchema, stationBodySchema } from "./category-and-station-schemas";
import { priceListDocumentSchema } from "./price-list-document-schema";
import { productDocumentSchema } from "./product-document-schema";

const ID = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";
const OTHER = "0192f5a4-7c3e-7d10-8b2a-000000000001";

describe("catalog bodies", () => {
  it("fills a category's sort order and an availability's channel and expiry when left out", () => {
    expect(categoryBodySchema.parse({ version: null, brandId: ID, name: " Trà sữa " })).toEqual({
      version: null,
      brandId: ID,
      name: "Trà sữa",
      sortOrder: 0,
    });
    expect(
      availabilityBodySchema.parse({ productId: ID, branchId: OTHER, available: false }),
    ).toEqual({
      productId: ID,
      branchId: OTHER,
      channelKey: null,
      available: false,
      unavailableUntil: null,
    });
  });

  it("refuses putting a product back on with an expiry, which only an 86 can have", () => {
    const body = { productId: ID, branchId: OTHER, unavailableUntil: "2026-10-20T15:00:00Z" };
    expect(outcomeOf(availabilityBodySchema, { ...body, available: false }).ok).toBe(true);
    expect(outcomeOf(availabilityBodySchema, { ...body, available: true }).ok).toBe(false);
  });

  it("refuses a field a body does not know, so a typo is not silently dropped", () => {
    expect(
      refusedPathsOf(stationBodySchema, { version: null, branchId: ID, name: "Bar", nmae: "x" }),
    ).toEqual([""]);
    expect(outcomeOf(stationBodySchema, { version: null, branchId: ID, name: "Bar" }).ok).toBe(
      true,
    );
  });

  it("refuses an amount that is not whole đồng and a blank name, naming the field", () => {
    const product = {
      version: null,
      brandId: ID,
      kind: "prepared_drink",
      name: "Trà sữa trân châu",
      basePrice: 35_000,
      pricingMode: "fixed",
    };
    expect(outcomeOf(productDocumentSchema, product).ok).toBe(true);
    expect(refusedPathsOf(productDocumentSchema, { ...product, basePrice: 35_000.5 })).toEqual([
      "basePrice",
    ]);
    expect(refusedPathsOf(productDocumentSchema, { ...product, name: "   " })).toEqual(["name"]);
  });

  it("leaves the price and rate rules to the domain: a negative price passes the shape", () => {
    const list = (effect: object) => ({
      version: null,
      brandId: ID,
      name: "Giờ vàng",
      items: [{ id: OTHER, scope: { kind: "global" }, effect }],
    });
    expect(outcomeOf(priceListDocumentSchema, list({ kind: "fixed_price", price: -1 })).ok).toBe(
      true,
    );
    expect(
      outcomeOf(
        priceListDocumentSchema,
        list({ kind: "percent_off", rateBp: 20_000, rounding: "down" }),
      ).ok,
    ).toBe(true);
    expect(refusedPathsOf(priceListDocumentSchema, list({ kind: "free" }))).toEqual([
      "items.0.effect.kind",
    ]);
  });
});
