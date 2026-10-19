import { vnd } from "../money";
import type { ModifierGroup, Product } from "./catalog-types";

/*
 * A pearl milk tea configured the way a real shop sells it: sizes M and L plus a
 * hot M, one sugar level, one ice level (not offered hot), and up to 3 toppings
 * on M or 5 on L, where the same topping may be taken twice.
 * Test data only; not exported from the package.
 */
export const SUGAR_LEVEL: ModifierGroup = {
  id: "sugar",
  name: "Mức đường",
  minSelect: 1,
  maxSelect: 1,
  allowDuplicates: false,
  options: [0, 30, 50, 70, 100].map((percent) => ({
    id: `sugar-${percent}`,
    name: `${percent}% đường`,
    priceDelta: vnd(0),
    maxQuantity: null,
  })),
  variantRules: {},
};

export const ICE_LEVEL: ModifierGroup = {
  id: "ice",
  name: "Mức đá",
  minSelect: 1,
  maxSelect: 1,
  allowDuplicates: false,
  options: [
    { id: "ice-none", name: "Không đá", priceDelta: vnd(0), maxQuantity: null },
    { id: "ice-less", name: "Ít đá", priceDelta: vnd(0), maxQuantity: null },
    { id: "ice-normal", name: "Đá bình thường", priceDelta: vnd(0), maxQuantity: null },
  ],
  variantRules: { "hot-m": { hidden: true } },
};

export const TOPPINGS: ModifierGroup = {
  id: "topping",
  name: "Topping",
  minSelect: 0,
  maxSelect: 3,
  allowDuplicates: true,
  options: [
    { id: "pearl", name: "Trân châu đen", priceDelta: vnd(5_000), maxQuantity: null },
    { id: "jelly", name: "Thạch", priceDelta: vnd(5_000), maxQuantity: null },
    { id: "pudding", name: "Pudding", priceDelta: vnd(7_000), maxQuantity: 2 },
  ],
  variantRules: { "size-l": { maxSelect: 5 } },
};

export const PEARL_MILK_TEA: Product = {
  id: "pearl-milk-tea",
  categoryId: "milk-tea",
  kind: "prepared_drink",
  name: "Trà sữa trân châu",
  basePrice: vnd(35_000),
  pricingMode: "fixed",
  variants: [
    { id: "size-m", name: "M", price: null },
    { id: "size-l", name: "L", price: vnd(45_000) },
    { id: "hot-m", name: "M nóng", price: null },
  ],
  modifierGroups: [SUGAR_LEVEL, ICE_LEVEL, TOPPINGS],
  combo: null,
};
