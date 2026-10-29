import { newId } from "@fnb/db";
import { type BackofficeCall, ensureNamed } from "./backoffice-caller";
import { seedSampleCombo } from "./seed-sample-combo";
import {
  GROUP_OPTIONS,
  type GroupKind,
  SAMPLE_CATEGORIES,
  SAMPLE_PRODUCTS,
  SAMPLE_STATION,
  SOLD_OUT_PRODUCT,
  type SampleProduct,
} from "./sample-menu-data";

const VAT_8_PERCENT = 800;

const GROUP_RULES: Readonly<
  Record<GroupKind, { name: string; min: number; max: number; duplicates: boolean }>
> = {
  sugar: { name: "Mức đường", min: 1, max: 1, duplicates: false },
  ice: { name: "Mức đá", min: 1, max: 1, duplicates: false },
  toppings: { name: "Topping", min: 0, max: 3, duplicates: true },
  coffeeExtras: { name: "Thêm", min: 0, max: 2, duplicates: true },
};

/**
 * Categories, the bar station and the products, through the same catalog routes the
 * backoffice's menu editor saves with (so every product passes the domain's checks), then
 * the sold-out product switched off at the branch, and the combo made of some of them.
 * Returns the product ids by name, the combo's among them.
 */
export async function seedSampleMenu(
  call: BackofficeCall,
  shop: { brandId: string; branchId: string },
): Promise<Map<string, string>> {
  const categories = await ensureNamed(
    call,
    `/catalog/categories?brandId=${shop.brandId}`,
    SAMPLE_CATEGORIES.map((name, index) => ({ name, index })),
    (id, { name, index }) =>
      call("PUT", `/catalog/categories/${id}`, {
        version: null,
        brandId: shop.brandId,
        name,
        sortOrder: index,
      }),
  );
  const stations = await ensureNamed(
    call,
    `/catalog/stations?branchId=${shop.branchId}`,
    [{ name: SAMPLE_STATION }],
    (id, { name }) =>
      call("PUT", `/catalog/stations/${id}`, { version: null, branchId: shop.branchId, name }),
  );
  const stationId = stations.get(SAMPLE_STATION) ?? null;
  const products = await ensureNamed(
    call,
    `/catalog/products?brandId=${shop.brandId}`,
    SAMPLE_PRODUCTS,
    (id, product) =>
      call(
        "PUT",
        `/catalog/products/${id}`,
        productDocument(product, {
          brandId: shop.brandId,
          categoryId: categories.get(product.category) ?? null,
          stationId,
        }),
      ),
  );
  const soldOutId = products.get(SOLD_OUT_PRODUCT);
  const off = await call<{ productId: string; channelKey: string | null }[]>(
    "GET",
    `/catalog/availability?branchId=${shop.branchId}`,
  );
  if (!off.some((entry) => entry.productId === soldOutId && entry.channelKey === null)) {
    await call("PUT", "/catalog/availability", {
      productId: soldOutId,
      branchId: shop.branchId,
      channelKey: null,
      available: false,
      unavailableUntil: null,
    });
  }
  for (const [name, id] of await seedSampleCombo(call, shop, categories)) products.set(name, id);
  return products;
}

function productDocument(
  product: SampleProduct,
  place: { brandId: string; categoryId: string | null; stationId: string | null },
) {
  const variants =
    product.largePrice === undefined
      ? []
      : [
          { id: newId(), name: "M", price: null },
          { id: newId(), name: "L", price: product.largePrice },
        ];
  const largeId = variants[1]?.id;
  return {
    version: null,
    ...place,
    kind: "prepared_drink",
    name: product.name,
    basePrice: product.basePrice,
    pricingMode: "fixed",
    taxRateBp: VAT_8_PERCENT,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: true,
    variants,
    modifierGroups: product.groups.map((kind) => modifierGroup(kind, largeId)),
    combo: null,
  };
}

function modifierGroup(kind: GroupKind, largeId: string | undefined) {
  const rule = GROUP_RULES[kind];
  const toppings = kind === "toppings";
  return {
    id: newId(),
    name: rule.name,
    minSelect: rule.min,
    maxSelect: rule.max,
    allowDuplicates: rule.duplicates,
    // Pudding at most twice in one cup, and a large cup takes up to five toppings.
    options: GROUP_OPTIONS[kind].map(([name, priceDelta]) => ({
      id: newId(),
      name,
      priceDelta,
      maxQuantity: toppings && name.startsWith("Pudding") ? 2 : null,
    })),
    variantRules: toppings && largeId !== undefined ? { [largeId]: { maxSelect: 5 } } : {},
  };
}
