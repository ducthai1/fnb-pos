import { describe, expect, it } from "vitest";
import { posProductSchema } from "../pos/pos-product-schema";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { productDocumentSchema } from "./product-document-schema";
import { productImageUploadSchema } from "./product-image-schemas";

const TENANT = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";
const KEY = `${"ab12".repeat(16)}.webp`;
const URL = `/media/product-images/${TENANT}/${KEY}`;

const product = {
  version: 3,
  brandId: TENANT,
  kind: "prepared_drink",
  name: "Cà phê sữa",
  basePrice: 29_000,
  pricingMode: "fixed",
};

const tillCopy = {
  id: TENANT,
  version: 12,
  brandId: TENANT,
  categoryId: null,
  stationId: null,
  kind: "prepared_drink",
  name: "Cà phê sữa",
  basePrice: 29_000,
  pricingMode: "fixed",
  taxRate: 0,
  trackStock: false,
  earnsPoints: true,
  printCupLabel: false,
  variants: [],
  modifierGroups: [],
  combo: null,
};

describe("a product's photo in the contracts", () => {
  it("leaves the photo out of a saved product unless named, and takes null to remove it", () => {
    expect(productDocumentSchema.parse(product)).not.toHaveProperty("imageKey");
    expect(productDocumentSchema.parse({ ...product, imageKey: KEY }).imageKey).toBe(KEY);
    expect(productDocumentSchema.parse({ ...product, imageKey: null }).imageKey).toBeNull();
  });

  it("refuses a photo name that is not a stored file's: a path, another extension, a URL", () => {
    for (const imageKey of [`../${KEY}`, `${"ab12".repeat(16)}.svg`, URL, "photo.webp"]) {
      expect(refusedPathsOf(productDocumentSchema, { ...product, imageKey })).toEqual(["imageKey"]);
    }
  });

  it("reads a till's copy with or without a photo, but only a photo served by the API", () => {
    expect(outcomeOf(posProductSchema, tillCopy).ok).toBe(true);
    expect(posProductSchema.parse({ ...tillCopy, imageUrl: URL }).imageUrl).toBe(URL);
    for (const imageUrl of ["javascript:alert(1)", `https://elsewhere.example/${KEY}`, null]) {
      expect(refusedPathsOf(posProductSchema, { ...tillCopy, imageUrl })).toEqual(["imageUrl"]);
    }
  });

  it("describes an upload's answer exactly", () => {
    const answer = { imageKey: KEY, imageUrl: URL, width: 800, height: 600 };
    expect(productImageUploadSchema.parse(answer)).toEqual(answer);
    expect(refusedPathsOf(productImageUploadSchema, { ...answer, width: 0 })).toEqual(["width"]);
  });
});
