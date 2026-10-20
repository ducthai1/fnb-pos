import type { PosProductWire } from "@fnb/contracts";
import { buildTillMenu, NO_MENU_COPIES, type TillMenu } from "../features/menu/till-menu";
import { HOSTILE_NAMES } from "./hostile-names";
import { COFFEE, MENU, MILK_TEA, tid, tillBootstrap, tillBootstrapWire } from "./till-fixtures";

const unbroken = (seed: string, length: number) =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

/** Names and amounts a shop may really enter that break naive layouts. */
export const HOSTILE_MENU_NAMES = {
  product: unbroken("TràSữaTrânChâuĐườngĐenKemCheeseMuối", 80),
  category: unbroken("ĐồUốngMùaHèGiảiNhiệt", 80),
  option: unbroken("TrânChâuHoàngKimSợiDài", 80),
  /** A note typed over several lines. */
  note: `${unbroken("ÍtĐáKhôngĐường", 80)}\nGiao cho bàn 5\n${HOSTILE_NAMES.emoji}`,
} as const;

/** 30 toppings with the long name, 0đ and 99.999.000đ among them. */
const thirtyToppings = Array.from({ length: 30 }, (_, index) => ({
  id: tid(0x500 + index),
  name: index === 0 ? HOSTILE_MENU_NAMES.option : `${HOSTILE_NAMES.decomposed} ${index}`,
  priceDelta: index === 1 ? 0 : index === 2 ? 99_999_000 : 5_000,
  maxQuantity: null,
}));

export const HOSTILE_PRODUCT: PosProductWire = {
  ...MILK_TEA,
  id: tid(0x400),
  name: HOSTILE_MENU_NAMES.product,
  categoryId: tid(0x401),
  basePrice: 0,
  variants: [
    { id: MENU.sizeM, name: HOSTILE_NAMES.emoji, price: null },
    { id: MENU.sizeL, name: "L", price: 99_999_000 },
  ],
  modifierGroups: [
    ...MILK_TEA.modifierGroups,
    {
      id: tid(0x402),
      name: HOSTILE_MENU_NAMES.option,
      minSelect: 0,
      maxSelect: 30,
      allowDuplicates: true,
      options: thirtyToppings,
      variantRules: {},
    },
  ],
};

/** The pilot café's menu with the worst names and amounts added, as the till holds it. */
export function hostileTillMenu(): TillMenu {
  const wire = tillBootstrapWire();
  const bootstrap = tillBootstrap({
    branch: { ...wire.branch, name: HOSTILE_NAMES.branch },
    brand: { ...wire.brand, name: HOSTILE_NAMES.branch },
    menu: {
      ...wire.menu,
      categories: [
        ...wire.menu.categories,
        {
          id: tid(0x401),
          version: 10,
          brandId: MENU.brand,
          name: HOSTILE_MENU_NAMES.category,
          sortOrder: 3,
        },
        {
          id: tid(0x403),
          version: 10,
          brandId: MENU.brand,
          name: HOSTILE_NAMES.emoji,
          sortOrder: 4,
        },
      ],
      products: [
        ...wire.menu.products,
        HOSTILE_PRODUCT,
        { ...COFFEE, id: tid(0x404), name: HOSTILE_NAMES.decomposed, categoryId: tid(0x403) },
        { ...COFFEE, id: tid(0x405), name: HOSTILE_NAMES.emoji, basePrice: 0 },
      ],
    },
  });
  return buildTillMenu(bootstrap, NO_MENU_COPIES, new Set());
}
