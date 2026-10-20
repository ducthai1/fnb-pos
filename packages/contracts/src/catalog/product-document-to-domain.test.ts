import { vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { productDocumentSchema } from "./product-document-schema";
import { productDocumentToDomain } from "./product-document-to-domain";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

const milkTea = productDocumentSchema.parse({
  version: null,
  brandId: id(1),
  categoryId: id(2),
  kind: "prepared_drink",
  name: "Trà sữa trân châu",
  basePrice: null,
  pricingMode: "fixed",
  taxRateBp: 800,
  stationId: null,
  trackStock: false,
  earnsPoints: true,
  printCupLabel: true,
  variants: [
    { id: id(3), name: "M", price: 35_000 },
    { id: id(4), name: "L", price: 42_000 },
  ],
  modifierGroups: [
    {
      id: id(5),
      name: "Topping",
      minSelect: 0,
      maxSelect: 3,
      allowDuplicates: true,
      options: [{ id: id(6), name: "Trân châu", priceDelta: 5_000, maxQuantity: 2 }],
      variantRules: { [id(4)]: { maxSelect: 5 }, [id(3)]: { hidden: false } },
    },
  ],
  combo: null,
});

describe("productDocumentToDomain", () => {
  it("turns every amount into đồng the domain counts in", () => {
    const product = productDocumentToDomain(id(9), milkTea);
    expect(product.id).toBe(id(9));
    expect(product.basePrice).toBeNull();
    expect(product.variants.map((variant) => variant.price)).toEqual([vnd(35_000), vnd(42_000)]);
    expect(product.modifierGroups[0]?.options[0]?.priceDelta).toBe(vnd(5_000));
  });

  it("keeps only the limits a size rule sets, so the rest inherit the group's", () => {
    const rules = productDocumentToDomain(id(9), milkTea).modifierGroups[0]?.variantRules;
    expect(rules).toEqual({ [id(4)]: { maxSelect: 5 }, [id(3)]: { hidden: false } });
    // A caller building the body by hand may spell an unset limit as undefined; the domain
    // would read a present key as an override, so it must not reach it.
    const [group] = milkTea.modifierGroups;
    if (group === undefined) throw new Error("fixture lost its group");
    const unset = { minSelect: undefined, maxSelect: 4, hidden: undefined };
    const spelled = { ...milkTea, modifierGroups: [{ ...group, variantRules: { [id(4)]: unset } }] };
    const rule = productDocumentToDomain(id(9), spelled).modifierGroups[0]?.variantRules[id(4)];
    expect(Object.keys(rule ?? {})).toEqual(["maxSelect"]);
  });

  it("carries a combo's slots with their upcharges, and no slots for a plain product", () => {
    expect(productDocumentToDomain(id(9), milkTea).combo).toBeNull();
    const combo = {
      ...milkTea,
      kind: "combo" as const,
      basePrice: 59_000,
      variants: [],
      modifierGroups: [],
      combo: {
        slots: [
          {
            id: id(7),
            name: "Đồ uống",
            minSelect: 1,
            maxSelect: 1,
            options: [{ productId: id(8), variantId: id(4), upcharge: 7_000 }],
          },
        ],
      },
    };
    const product = productDocumentToDomain(id(9), combo);
    expect(product.basePrice).toBe(vnd(59_000));
    expect(product.combo?.slots[0]?.options).toEqual([
      { productId: id(8), variantId: id(4), upcharge: vnd(7_000) },
    ]);
  });
});
