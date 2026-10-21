import type { ProductDraft } from "../components/menu/product-editor/product-draft";
import { BRANCHES } from "./fake-backoffice-api";

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** Ids of the pearl milk tea, for tests that point at one size, group or option. */
export const TEA = {
  product: id(100),
  sizeM: id(101),
  sizeL: id(102),
  sugar: id(110),
  sugarFull: id(111),
  sugarHalf: id(112),
  ice: id(120),
  iceNormal: id(121),
  iceNone: id(122),
  topping: id(130),
  pearl: id(131),
  jelly: id(132),
  pudding: id(133),
} as const;

/**
 * Trà sữa trân châu as a shop sets it up: M at the product price, L dearer; one sugar
 * level and one ice level required; up to 3 toppings (5 on an L), pearls at most twice.
 */
export function milkTeaDraft(): ProductDraft {
  return {
    id: TEA.product,
    version: 3,
    archivedAt: null,
    brandId: BRANCHES[0]!.brandId,
    categoryId: null,
    kind: "prepared_drink",
    name: "Trà sữa trân châu",
    basePrice: "35.000",
    pricingMode: "fixed",
    taxRate: "8",
    stationId: null,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: true,
    photo: null,
    variants: [
      { id: TEA.sizeM, name: "M", price: "" },
      { id: TEA.sizeL, name: "L", price: "45.000" },
    ],
    modifierGroups: [
      {
        id: TEA.sugar,
        name: "Đường",
        minSelect: "1",
        maxSelect: "1",
        allowDuplicates: false,
        options: [
          { id: TEA.sugarFull, name: "100%", priceDelta: "0", maxQuantity: "" },
          { id: TEA.sugarHalf, name: "50%", priceDelta: "0", maxQuantity: "" },
        ],
        variantRules: {},
      },
      {
        id: TEA.ice,
        name: "Đá",
        minSelect: "1",
        maxSelect: "1",
        allowDuplicates: false,
        options: [
          { id: TEA.iceNormal, name: "Bình thường", priceDelta: "0", maxQuantity: "" },
          { id: TEA.iceNone, name: "Không đá", priceDelta: "0", maxQuantity: "" },
        ],
        variantRules: {},
      },
      {
        id: TEA.topping,
        name: "Topping",
        minSelect: "0",
        maxSelect: "3",
        allowDuplicates: true,
        options: [
          { id: TEA.pearl, name: "Trân châu đen", priceDelta: "5.000", maxQuantity: "2" },
          { id: TEA.jelly, name: "Thạch", priceDelta: "5.000", maxQuantity: "" },
          { id: TEA.pudding, name: "Pudding", priceDelta: "7.000", maxQuantity: "" },
        ],
        variantRules: { [TEA.sizeL]: { hidden: false, minSelect: "", maxSelect: "5" } },
      },
    ],
    combo: null,
  };
}
