import { newId } from "@fnb/db";
import type { CatalogShop } from "./catalog-shop";

/**
 * A pearl milk tea as a shop configures it: sizes M and L, one sugar level, one ice level,
 * and up to 3 toppings on M or 5 on L, where a topping may be doubled and pudding is
 * capped at 2. Every id is fresh, so each call is a new product.
 */
export function pearlMilkTeaDocument(
  shop: Pick<CatalogShop, "brandId" | "categoryId" | "stationId">,
) {
  const ids = {
    product: newId(),
    sizeM: newId(),
    sizeL: newId(),
    sugar: newId(),
    ice: newId(),
    topping: newId(),
    pearl: newId(),
    jelly: newId(),
    pudding: newId(),
  };
  const zeroCost = (name: string) => ({ id: newId(), name, priceDelta: 0, maxQuantity: null });
  const body = {
    version: null as number | null,
    brandId: shop.brandId,
    categoryId: shop.categoryId,
    kind: "prepared_drink",
    name: "Trà sữa trân châu",
    basePrice: 35_000,
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: shop.stationId,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: true,
    variants: [
      { id: ids.sizeM, name: "M", price: null as number | null },
      { id: ids.sizeL, name: "L", price: 45_000 as number | null },
    ],
    modifierGroups: [
      {
        id: ids.sugar,
        name: "Mức đường",
        minSelect: 1,
        maxSelect: 1,
        allowDuplicates: false,
        options: [0, 30, 50, 70, 100].map((percent) => zeroCost(`${percent}% đường`)),
        variantRules: {} as Record<string, Record<string, unknown>>,
      },
      {
        id: ids.ice,
        name: "Mức đá",
        minSelect: 1,
        maxSelect: 1,
        allowDuplicates: false,
        options: ["Không đá", "Ít đá", "Đá bình thường"].map(zeroCost),
        variantRules: {} as Record<string, Record<string, unknown>>,
      },
      {
        id: ids.topping,
        name: "Topping",
        minSelect: 0,
        maxSelect: 3,
        allowDuplicates: true,
        options: [
          { id: ids.pearl, name: "Trân châu đen", priceDelta: 5_000, maxQuantity: null },
          { id: ids.jelly, name: "Thạch", priceDelta: 5_000, maxQuantity: null },
          { id: ids.pudding, name: "Pudding", priceDelta: 7_000, maxQuantity: 2 as number | null },
        ],
        variantRules: { [ids.sizeL]: { maxSelect: 5 } } as Record<string, Record<string, unknown>>,
      },
    ],
    combo: null as unknown,
  };
  return { ids, body, url: `/catalog/products/${ids.product}` };
}

/** What GET answers for a body just saved: the body without its version, plus the stored state. */
export function storedDocument(
  id: string,
  body: { version: number | null } & Record<string, unknown>,
  version: number,
) {
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "version"));
  return { id, version, archivedAt: null, ...rest };
}
