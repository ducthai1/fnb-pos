/**
 * The sample shop's menu: coffee, milk tea and fruit tea, prices in đồng with VAT (8%)
 * included, as a Saigon café prices them. Data only; sample-product-documents turns it into
 * what the catalog routes take.
 */
export type GroupKind = "sugar" | "ice" | "toppings" | "coffeeExtras";

export interface SampleProduct {
  readonly name: string;
  readonly category: string;
  readonly basePrice: number;
  /** Size L's price; sizes M and L when given. */
  readonly largePrice?: number;
  readonly groups: readonly GroupKind[];
}

export const SAMPLE_CATEGORIES = ["Cà phê", "Trà sữa", "Trà trái cây"] as const;

export const SAMPLE_STATION = "Quầy pha chế";

/** Marked sold out at the branch, so the till shows what an "86" looks like. */
export const SOLD_OUT_PRODUCT = "Cold brew cam sả";

const [COFFEE, MILK_TEA, FRUIT_TEA] = SAMPLE_CATEGORIES;
const MILK_TEA_GROUPS: readonly GroupKind[] = ["sugar", "ice", "toppings"];

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  { name: "Cà phê đen đá", category: COFFEE, basePrice: 25_000, groups: ["sugar", "ice"] },
  { name: "Cà phê sữa đá", category: COFFEE, basePrice: 29_000, groups: ["ice", "coffeeExtras"] },
  { name: "Bạc xỉu", category: COFFEE, basePrice: 32_000, groups: ["ice", "coffeeExtras"] },
  { name: "Cà phê muối", category: COFFEE, basePrice: 35_000, groups: ["ice"] },
  {
    name: "Americano",
    category: COFFEE,
    basePrice: 35_000,
    largePrice: 45_000,
    groups: ["ice", "coffeeExtras"],
  },
  { name: "Latte", category: COFFEE, basePrice: 45_000, largePrice: 55_000, groups: ["sugar"] },
  { name: "Cappuccino", category: COFFEE, basePrice: 45_000, largePrice: 55_000, groups: [] },
  { name: SOLD_OUT_PRODUCT, category: COFFEE, basePrice: 49_000, groups: ["sugar"] },
  {
    name: "Trà sữa trân châu",
    category: MILK_TEA,
    basePrice: 35_000,
    largePrice: 45_000,
    groups: MILK_TEA_GROUPS,
  },
  {
    name: "Trà sữa matcha",
    category: MILK_TEA,
    basePrice: 39_000,
    largePrice: 49_000,
    groups: MILK_TEA_GROUPS,
  },
  {
    name: "Trà sữa ô long",
    category: MILK_TEA,
    basePrice: 39_000,
    largePrice: 49_000,
    groups: MILK_TEA_GROUPS,
  },
  {
    name: "Hồng trà sữa",
    category: MILK_TEA,
    basePrice: 35_000,
    largePrice: 45_000,
    groups: MILK_TEA_GROUPS,
  },
  {
    name: "Sữa tươi trân châu đường đen",
    category: MILK_TEA,
    basePrice: 42_000,
    largePrice: 52_000,
    groups: ["ice", "toppings"],
  },
  {
    name: "Trà đào cam sả",
    category: FRUIT_TEA,
    basePrice: 39_000,
    largePrice: 49_000,
    groups: ["sugar", "ice"],
  },
  {
    name: "Trà vải",
    category: FRUIT_TEA,
    basePrice: 39_000,
    largePrice: 49_000,
    groups: ["sugar", "ice", "toppings"],
  },
];

/** Options of each group: name and price in đồng. */
export const GROUP_OPTIONS: Readonly<Record<GroupKind, readonly (readonly [string, number])[]>> = {
  sugar: [
    ["Không đường", 0],
    ["30% đường", 0],
    ["50% đường", 0],
    ["70% đường", 0],
    ["100% đường", 0],
  ],
  ice: [
    ["Không đá", 0],
    ["Ít đá", 0],
    ["Đá bình thường", 0],
  ],
  toppings: [
    ["Trân châu đen", 5_000],
    ["Trân châu trắng", 6_000],
    ["Thạch phô mai", 7_000],
    ["Pudding trứng", 7_000],
    ["Kem cheese", 10_000],
  ],
  coffeeExtras: [
    ["Thêm shot", 10_000],
    ["Kem muối", 7_000],
  ],
};

/** One part of the sample combo: which products a customer may pick for it, by name and size. */
export interface SampleComboSlot {
  readonly name: string;
  readonly options: readonly { readonly product: string; readonly size: string; readonly upcharge: number }[];
}

/**
 * Two drinks for one price, so the owner can tap a combo at the till: a pearl milk tea
 * (size L for 10.000 more) and a fruit tea. Its price covers both at size M.
 */
export const SAMPLE_COMBO = {
  name: "Combo đôi",
  category: MILK_TEA,
  basePrice: 69_000,
  slots: [
    {
      name: "Trà sữa",
      options: [
        { product: "Trà sữa trân châu", size: "M", upcharge: 0 },
        { product: "Trà sữa trân châu", size: "L", upcharge: 10_000 },
      ],
    },
    {
      name: "Trà trái cây",
      options: [
        { product: "Trà đào cam sả", size: "M", upcharge: 0 },
        { product: "Trà vải", size: "M", upcharge: 0 },
      ],
    },
  ],
} as const satisfies { name: string; category: string; basePrice: number; slots: readonly SampleComboSlot[] };
