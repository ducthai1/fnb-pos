import { type PosBootstrapWire, type PosProductWire, posBootstrapSchema } from "@fnb/contracts";
import type { BootstrapSnapshot } from "../features/bootstrap/bootstrap-source";
import { CREDENTIAL } from "./credential";

export const tid = (n: number) => `0199f000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** Ids of the pilot café's menu, so tests can name what they tap. */
export const MENU = {
  brand: tid(0x100),
  drinks: tid(0x101),
  food: tid(0x102),
  bar: tid(0x103),
  milkTea: tid(0x110),
  sizeM: tid(0x111),
  sizeL: tid(0x112),
  sugar: tid(0x113),
  sugarFull: tid(0x114),
  sugarHalf: tid(0x115),
  toppings: tid(0x116),
  pearl: tid(0x117),
  jelly: tid(0x118),
  coffee: tid(0x120),
  extras: tid(0x121),
  extraShot: tid(0x122),
  cake: tid(0x130),
  combo: tid(0x140),
} as const;

const VERSION = 10;

const drink = (wire: Partial<PosProductWire> & Pick<PosProductWire, "id" | "name">) =>
  ({
    version: VERSION,
    brandId: MENU.brand,
    categoryId: MENU.drinks,
    stationId: MENU.bar,
    kind: "prepared_drink",
    basePrice: null,
    pricingMode: "fixed",
    taxRate: 800,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: true,
    variants: [],
    modifierGroups: [],
    combo: null,
    ...wire,
  }) satisfies PosProductWire;

/** Trà sữa M 35.000 / L 45.000, sugar required, up to 2 toppings (3 in L), pearls at most 2. */
export const MILK_TEA = drink({
  id: MENU.milkTea,
  name: "Trà sữa trân châu",
  basePrice: 35_000,
  variants: [
    { id: MENU.sizeM, name: "M", price: null },
    { id: MENU.sizeL, name: "L", price: 45_000 },
  ],
  modifierGroups: [
    {
      id: MENU.sugar,
      name: "Đường",
      minSelect: 1,
      maxSelect: 1,
      allowDuplicates: false,
      options: [
        { id: MENU.sugarFull, name: "100% đường", priceDelta: 0, maxQuantity: null },
        { id: MENU.sugarHalf, name: "50% đường", priceDelta: 0, maxQuantity: null },
      ],
      variantRules: {},
    },
    {
      id: MENU.toppings,
      name: "Topping",
      minSelect: 0,
      maxSelect: 2,
      allowDuplicates: true,
      options: [
        { id: MENU.pearl, name: "Trân châu đen", priceDelta: 5_000, maxQuantity: 2 },
        { id: MENU.jelly, name: "Thạch dừa", priceDelta: 7_000, maxQuantity: null },
      ],
      variantRules: { [MENU.sizeL]: { maxSelect: 3 } },
    },
  ],
});

/** Cà phê sữa 29.000, an extra shot 10.000 at most twice. */
export const COFFEE = drink({
  id: MENU.coffee,
  name: "Cà phê sữa",
  basePrice: 29_000,
  modifierGroups: [
    {
      id: MENU.extras,
      name: "Thêm",
      minSelect: 0,
      maxSelect: 2,
      allowDuplicates: true,
      options: [{ id: MENU.extraShot, name: "Thêm shot", priceDelta: 10_000, maxQuantity: null }],
      variantRules: {},
    },
  ],
});

export function tillBootstrapWire(overrides: Partial<PosBootstrapWire> = {}): PosBootstrapWire {
  return {
    cursor: String(VERSION),
    device: { id: CREDENTIAL.deviceId, name: "Quầy 1", branchId: CREDENTIAL.branchId },
    branch: {
      id: CREDENTIAL.branchId,
      brandId: MENU.brand,
      name: "Quận 1",
      utcOffsetMinutes: 420,
      businessDayStartMinute: 240,
    },
    brand: { id: MENU.brand, name: "Cà Phê Mây" },
    config: {
      id: CREDENTIAL.deviceId,
      version: VERSION,
      flags: { pay_first_counter: true },
      settings: {},
      chargeProfile: { pricesIncludeTax: true, serviceCharge: null },
    },
    staff: [],
    menu: {
      categories: [
        { id: MENU.drinks, version: VERSION, brandId: MENU.brand, name: "Đồ uống", sortOrder: 1 },
        { id: MENU.food, version: VERSION, brandId: MENU.brand, name: "Bánh", sortOrder: 2 },
      ],
      stations: [{ id: MENU.bar, version: VERSION, branchId: CREDENTIAL.branchId, name: "Bar" }],
      products: [
        MILK_TEA,
        COFFEE,
        drink({
          id: MENU.cake,
          name: "Bánh croissant",
          kind: "retail_item",
          categoryId: MENU.food,
          stationId: null,
          printCupLabel: false,
          basePrice: 25_000,
        }),
        drink({ id: MENU.combo, name: "Combo sáng", kind: "combo", basePrice: 50_000 }),
      ],
      priceLists: [],
      availability: [
        {
          productId: MENU.cake,
          version: VERSION,
          entries: [{ channelKey: null, unavailableUntil: null }],
        },
      ],
    },
    ...overrides,
  };
}

/** The bootstrap as the till holds it once parsed. */
export function tillBootstrap(overrides: Partial<PosBootstrapWire> = {}): BootstrapSnapshot {
  return posBootstrapSchema.parse(tillBootstrapWire(overrides));
}
