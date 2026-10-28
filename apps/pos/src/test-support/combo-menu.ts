import type { PosProductWire } from "@fnb/contracts";
import { CREDENTIAL } from "./credential";
import { buildTillMenu, NO_MENU_COPIES, type TillMenu } from "../features/menu/till-menu";
import { HOSTILE_MENU_NAMES, HOSTILE_PRODUCT } from "./hostile-menu";
import { HOSTILE_NAMES } from "./hostile-names";
import { COFFEE, MENU, tid, tillBootstrap, tillBootstrapWire } from "./till-fixtures";

/** Ids of the breakfast combo and the kitchen its croissant is baked in. */
export const COMBO = {
  id: tid(0x150),
  drinkSlot: tid(0x151),
  bakerySlot: tid(0x152),
  kitchen: tid(0x153),
} as const;

/**
 * Combo sáng 50.000: one drink (trà sữa M, trà sữa L for 10.000 more, or cà phê sữa) and up
 * to two croissants, each 0đ. The drinks go to the bar, the croissant to the kitchen.
 */
export const BREAKFAST_COMBO: PosProductWire = {
  ...COFFEE,
  id: COMBO.id,
  name: "Combo sáng",
  kind: "combo",
  stationId: null,
  printCupLabel: false,
  basePrice: 50_000,
  modifierGroups: [],
  combo: {
    slots: [
      {
        id: COMBO.drinkSlot,
        name: "Đồ uống",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { productId: MENU.milkTea, variantId: MENU.sizeM, upcharge: 0 },
          { productId: MENU.milkTea, variantId: MENU.sizeL, upcharge: 10_000 },
          { productId: MENU.coffee, variantId: null, upcharge: 0 },
        ],
      },
      {
        id: COMBO.bakerySlot,
        name: "Bánh",
        minSelect: 0,
        maxSelect: 2,
        options: [{ productId: MENU.cake, variantId: null, upcharge: 0 }],
      },
    ],
  },
};

/**
 * The pilot café's menu with the breakfast combo on it; the croissant has a kitchen and is
 * not sold out, unless `croissantSoldOut`.
 */
export function comboTillMenu(croissantSoldOut = false): TillMenu {
  const wire = tillBootstrapWire();
  const bootstrap = tillBootstrap({
    menu: {
      ...wire.menu,
      stations: [
        ...wire.menu.stations,
        { id: COMBO.kitchen, version: 10, branchId: CREDENTIAL.branchId, name: "Bếp" },
      ],
      products: [
        ...wire.menu.products.map((product) =>
          product.id === MENU.cake ? { ...product, stationId: COMBO.kitchen } : product,
        ),
        BREAKFAST_COMBO,
      ],
      availability: croissantSoldOut ? wire.menu.availability : [],
    },
  });
  return buildTillMenu(bootstrap, NO_MENU_COPIES, new Set());
}

/**
 * The worst combo a shop can set up: an 80-letter name, a required slot whose one drink
 * (the hostile milk tea, 30 toppings) is filled at once and shows all its options, and a
 * slot of up to 30 with emoji and decomposed names, a 99.999.000đ upcharge and a sold-out cake.
 */
export const HOSTILE_COMBO: PosProductWire = {
  ...BREAKFAST_COMBO,
  id: tid(0x450),
  name: HOSTILE_MENU_NAMES.product,
  combo: {
    slots: [
      {
        id: tid(0x451),
        name: HOSTILE_MENU_NAMES.category,
        minSelect: 1,
        maxSelect: 1,
        options: [{ productId: HOSTILE_PRODUCT.id, variantId: MENU.sizeM, upcharge: 0 }],
      },
      {
        id: tid(0x452),
        name: HOSTILE_NAMES.emoji,
        minSelect: 0,
        maxSelect: 30,
        options: [
          { productId: MENU.coffee, variantId: null, upcharge: 5_000 },
          { productId: tid(0x404), variantId: null, upcharge: 99_999_000 },
          { productId: tid(0x405), variantId: null, upcharge: 0 },
          { productId: MENU.cake, variantId: null, upcharge: 0 },
        ],
      },
    ],
  },
};
