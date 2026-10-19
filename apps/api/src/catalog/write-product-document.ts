import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";
import {
  type CatalogWriteContext,
  insertCatalogRow,
  putVersionedRow,
  updateCatalogRow,
} from "./catalog-row-writes";
import type { CheckedProductDocument } from "./product-document-to-domain";
import type { ProductDocumentInput } from "./product-document-schema";
import { writeProductCombo } from "./write-product-combo";
import { writeProductModifierGroups } from "./write-product-modifier-groups";

/**
 * Saves a whole product in the caller's transaction: header, variants, modifier groups
 * with their options and variant rules, and combo slots. Variants and options left out
 * of the body are archived, never deleted, since past orders point at them; the rows that
 * only arrange the product are replaced. Returns the product's new version.
 */
export async function writeProductDocument(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  input: ProductDocumentInput,
  checked: CheckedProductDocument,
): Promise<{ version: number; created: boolean }> {
  const { product, taxRate } = checked;
  const saved = await putVersionedRow(client, context, {
    table: "product",
    id: product.id,
    expectedVersion: input.version,
    parent: { column: "brand_id", value: input.brandId },
    notFoundCode: CATALOG_API_ERROR_CODES.productNotFound,
    cells: {
      category_id: product.categoryId,
      kind: product.kind,
      name: product.name,
      base_price: product.basePrice,
      pricing_mode: product.pricingMode,
      tax_rate_bp: taxRate,
      station_id: input.stationId,
      track_stock: input.trackStock,
      earns_points: input.earnsPoints,
      print_cup_label: input.printCupLabel,
    },
  });
  await writeVariants(client, context, checked);
  await writeProductModifierGroups(client, context, product);
  await writeProductCombo(client, context, product);
  return saved;
}

async function writeVariants(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  { product }: CheckedProductDocument,
): Promise<void> {
  const ids = product.variants.map((variant) => variant.id);
  const existing = await client.query<{ id: string; product_id: string }>(
    "SELECT id, product_id FROM product_variant WHERE id = ANY($1::uuid[]) FOR UPDATE",
    [ids],
  );
  // A variant id of another product would move that product's size here, and its order
  // history with it.
  if (existing.rows.some((row) => row.product_id !== product.id)) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.idConflict);
  }
  const stored = new Set(existing.rows.map((row) => row.id));
  for (const [index, variant] of product.variants.entries()) {
    const cells = {
      name: variant.name,
      price: variant.price,
      sort_order: index,
      archived_at: null,
    };
    if (stored.has(variant.id))
      await updateCatalogRow(client, "product_variant", context, variant.id, cells);
    else
      await insertCatalogRow(client, "product_variant", context, {
        id: variant.id,
        product_id: product.id,
        ...cells,
      });
  }
  await client.query(
    "UPDATE product_variant SET archived_at = $2, updated_at = $2, version = version + 1 " +
      "WHERE product_id = $1 AND archived_at IS NULL AND NOT (id = ANY($3::uuid[]))",
    [product.id, context.now, ids],
  );
}
