import type { PosProductWire } from "@fnb/contracts";
import { buildTillMenu, NO_MENU_COPIES } from "../../src/features/menu/till-menu";
import { MENU, tid, tillBootstrap, tillBootstrapWire } from "../../src/test-support/till-fixtures";
import { PHOTO_URLS, type PhotoFile } from "./pretty-photos";

// The sample café "Cà phê Mẫu" as the till holds it: the seed's menu, prices with VAT
// included, every drink with its photo, one marked sold out.

export const SHOP = { brand: "Cà phê Mẫu", branch: "Cà phê Mẫu - Quận 1", device: "Quầy 1" };
export const PROFILE = { pricesIncludeTax: true, serviceCharge: null };

const CATEGORY = { coffee: tid(0x9001), milkTea: tid(0x9002), fruitTea: tid(0x9003) };
export const SIZE = { m: tid(0x9011), l: tid(0x9012) };
export const OPT = {
  sugar: tid(0x9020),
  sugar50: tid(0x9021),
  sugar100: tid(0x9022),
  sugar70: tid(0x9023),
  ice: tid(0x9030),
  iceLess: tid(0x9031),
  iceNormal: tid(0x9032),
  topping: tid(0x9040),
  pearl: tid(0x9041),
  cheese: tid(0x9042),
  pudding: tid(0x9043),
  extras: tid(0x9050),
  saltCream: tid(0x9051),
  shot: tid(0x9052),
};

const option = (id: string, name: string, priceDelta = 0, maxQuantity: number | null = null) => ({
  id,
  name,
  priceDelta,
  maxQuantity,
});
const group = (id: string, name: string, min: number, max: number, options: unknown[]) => ({
  id,
  name,
  minSelect: min,
  maxSelect: max,
  allowDuplicates: max > 1,
  options,
  variantRules: {},
});
const GROUPS = {
  sugar: group(OPT.sugar, "Đường", 1, 1, [
    option(OPT.sugar50, "50% đường"),
    option(OPT.sugar70, "70% đường"),
    option(OPT.sugar100, "100% đường"),
  ]),
  ice: group(OPT.ice, "Đá", 1, 1, [
    option(OPT.iceLess, "Ít đá"),
    option(OPT.iceNormal, "Đá bình thường"),
  ]),
  topping: group(OPT.topping, "Topping", 0, 3, [
    option(OPT.pearl, "Trân châu đen", 5_000, 2),
    option(OPT.cheese, "Kem cheese", 10_000),
    option(OPT.pudding, "Pudding trứng", 7_000),
  ]),
  extras: group(OPT.extras, "Thêm", 0, 2, [
    option(OPT.saltCream, "Kem muối", 7_000),
    option(OPT.shot, "Thêm shot", 10_000),
  ]),
};

type Row = [number, string, PhotoFile, string, number, number | null, (keyof typeof GROUPS)[]];
const ROWS: Row[] = [
  [0x9101, "Cà phê đen đá", "ca-phe-den-da", CATEGORY.coffee, 25_000, null, ["sugar", "ice"]],
  [0x9102, "Cà phê sữa đá", "ca-phe-sua-da", CATEGORY.coffee, 29_000, null, ["ice", "extras"]],
  [0x9103, "Bạc xỉu", "bac-xiu", CATEGORY.coffee, 32_000, null, ["ice", "extras"]],
  [0x9104, "Cà phê muối", "ca-phe-muoi", CATEGORY.coffee, 35_000, null, ["ice"]],
  [0x9105, "Americano", "americano", CATEGORY.coffee, 35_000, 45_000, ["ice", "extras"]],
  [0x9106, "Latte", "latte", CATEGORY.coffee, 45_000, 55_000, ["sugar"]],
  [0x9107, "Cappuccino", "cappuccino", CATEGORY.coffee, 45_000, 55_000, []],
  [0x9108, "Cold brew cam sả", "cold-brew-cam-sa", CATEGORY.coffee, 49_000, null, ["sugar"]],
  [
    0x9109,
    "Trà sữa trân châu",
    "tra-sua-tran-chau",
    CATEGORY.milkTea,
    35_000,
    45_000,
    ["sugar", "ice", "topping"],
  ],
  [
    0x910a,
    "Trà sữa matcha",
    "tra-sua-matcha",
    CATEGORY.milkTea,
    39_000,
    49_000,
    ["sugar", "ice", "topping"],
  ],
  [
    0x910b,
    "Trà sữa ô long",
    "tra-sua-o-long",
    CATEGORY.milkTea,
    39_000,
    49_000,
    ["sugar", "ice", "topping"],
  ],
  [
    0x910c,
    "Hồng trà sữa",
    "hong-tra-sua",
    CATEGORY.milkTea,
    35_000,
    45_000,
    ["sugar", "ice", "topping"],
  ],
  [
    0x910d,
    "Sữa tươi trân châu đường đen",
    "sua-tuoi-tran-chau-duong-den",
    CATEGORY.milkTea,
    42_000,
    52_000,
    ["ice", "topping"],
  ],
  [0x910e, "Trà đào cam sả", "tra-dao-cam-sa", CATEGORY.fruitTea, 39_000, 49_000, ["sugar", "ice"]],
  [0x910f, "Trà vải", "tra-vai", CATEGORY.fruitTea, 39_000, 49_000, ["sugar", "ice", "topping"]],
];

export const PRODUCTS: PosProductWire[] = ROWS.map(
  ([n, name, photo, categoryId, base, large, groups]) => ({
    id: tid(n),
    name,
    version: 10,
    brandId: MENU.brand,
    categoryId,
    stationId: MENU.bar,
    kind: "prepared_drink",
    basePrice: base,
    pricingMode: "fixed",
    taxRate: 800,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: true,
    variants:
      large === null
        ? []
        : [
            { id: SIZE.m, name: "M", price: null },
            { id: SIZE.l, name: "L", price: large },
          ],
    modifierGroups: groups.map((kind) => GROUPS[kind]),
    combo: null,
    imageUrl: PHOTO_URLS[photo],
  }),
) as PosProductWire[];

/** Product ids by name, so the screens name what the guest ordered. */
export const P = Object.fromEntries(PRODUCTS.map((p) => [p.name, p.id])) as Record<string, string>;

export function prettyTillMenu() {
  const wire = tillBootstrapWire();
  const category = (id: string, name: string, sortOrder: number) => ({
    id,
    version: 10,
    brandId: MENU.brand,
    name,
    sortOrder,
  });
  const bootstrap = tillBootstrap({
    branch: { ...wire.branch, name: SHOP.branch },
    brand: { ...wire.brand, name: SHOP.brand },
    config: {
      ...wire.config,
      chargeProfile: PROFILE,
      flags: {
        pay_first_counter: true,
        tables: true,
        cup_labels: true,
        kitchen_routing: true,
        happy_hour_pricing: true,
      },
    },
    menu: {
      ...wire.menu,
      categories: [
        category(CATEGORY.coffee, "Cà phê", 1),
        category(CATEGORY.milkTea, "Trà sữa", 2),
        category(CATEGORY.fruitTea, "Trà trái cây", 3),
      ],
      stations: [{ ...wire.menu.stations[0]!, name: "Quầy pha chế" }],
      products: PRODUCTS,
      availability: [
        {
          productId: P["Cold brew cam sả"]!,
          version: 10,
          entries: [{ channelKey: null, unavailableUntil: null }],
        },
      ],
    },
  });
  return buildTillMenu(bootstrap, NO_MENU_COPIES, new Set());
}
