import { newId } from "@fnb/db";
import { type BackofficeCall, ensureNamed } from "./backoffice-caller";
import { SAMPLE_COMBO } from "./sample-menu-data";

const VAT_8_PERCENT = 800;

interface ListedProduct {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
}

/**
 * The sample combo, saved through the same route as any product (so the domain checks its
 * parts): each choice names a product and the size of it the combo is made with. It is made
 * after the products it holds, whose sizes it reads back from the catalog. Running again
 * makes nothing twice. Returns the combo's id by name.
 */
export async function seedSampleCombo(
  call: BackofficeCall,
  shop: { brandId: string },
  categories: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const listed = await call<ListedProduct[]>("GET", `/catalog/products?brandId=${shop.brandId}`);
  const sizeId = (product: string, size: string): string => {
    const found = listed.find((row) => row.name === product)?.variants.find((variant) => variant.name === size);
    if (found === undefined) throw new Error(`the sample combo needs ${product} in size ${size}`);
    return found.id;
  };
  const productId = (name: string): string => {
    const found = listed.find((row) => row.name === name);
    if (found === undefined) throw new Error(`the sample combo needs ${name}`);
    return found.id;
  };
  return ensureNamed(call, `/catalog/products?brandId=${shop.brandId}`, [SAMPLE_COMBO], (id, combo) =>
    call("PUT", `/catalog/products/${id}`, {
      version: null,
      brandId: shop.brandId,
      categoryId: categories.get(combo.category) ?? null,
      stationId: null,
      kind: "combo",
      name: combo.name,
      basePrice: combo.basePrice,
      pricingMode: "fixed",
      taxRateBp: VAT_8_PERCENT,
      trackStock: false,
      earnsPoints: true,
      printCupLabel: false,
      variants: [],
      modifierGroups: [],
      combo: {
        slots: combo.slots.map((slot) => ({
          id: newId(),
          name: slot.name,
          minSelect: 1,
          maxSelect: 1,
          options: slot.options.map((option) => ({
            productId: productId(option.product),
            variantId: sizeId(option.product, option.size),
            upcharge: option.upcharge,
          })),
        })),
      },
    }),
  );
}
