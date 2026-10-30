import type { Product } from "@fnb/domain";
import { newId } from "@fnb/db";
import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";
import { type CatalogWriteContext, insertCatalogRow } from "./catalog-row-writes";

/**
 * Replaces the product's combo slots. Slot rows only arrange the combo (an order line
 * records the products it was filled with), so they are rewritten rather than diffed.
 */
export async function writeProductCombo(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  product: Product,
): Promise<void> {
  await refuseUnsellableOptions(client, product);
  await client.query(
    "DELETE FROM combo_slot_option WHERE combo_slot_id IN (SELECT id FROM combo_slot WHERE product_id = $1)",
    [product.id],
  );
  await client.query("DELETE FROM combo_slot WHERE product_id = $1", [product.id]);
  for (const [slotIndex, slot] of (product.combo?.slots ?? []).entries()) {
    await insertCatalogRow(client, "combo_slot", context, {
      id: slot.id,
      product_id: product.id,
      name: slot.name,
      min_select: slot.minSelect,
      max_select: slot.maxSelect,
      sort_order: slotIndex,
    });
    for (const [optionIndex, option] of slot.options.entries()) {
      await insertCatalogRow(client, "combo_slot_option", context, {
        id: newId(),
        combo_slot_id: slot.id,
        product_id: option.productId,
        variant_id: option.variantId,
        upcharge: option.upcharge,
        sort_order: optionIndex,
      });
    }
  }
}

/**
 * A slot offers products a till can put in a combo: never another combo (its own slots would
 * be a combo inside a combo) and never one taken off the menu (the till refuses it at sale).
 * Products the tenant does not hold are the foreign key's to refuse.
 */
async function refuseUnsellableOptions(client: pg.PoolClient, product: Product): Promise<void> {
  const offered = [
    ...new Set(
      (product.combo?.slots ?? []).flatMap((slot) => slot.options.map((o) => o.productId)),
    ),
  ];
  if (offered.length === 0) return;
  const found = await client.query<{ kind: string; archived: boolean }>(
    "SELECT kind, archived_at IS NOT NULL AS archived FROM product WHERE id = ANY($1::uuid[])",
    [offered],
  );
  if (found.rows.some((row) => row.kind === "combo")) {
    throw new CatalogRequestError(400, CATALOG_API_ERROR_CODES.comboOptionIsCombo);
  }
  if (found.rows.some((row) => row.archived)) {
    throw new CatalogRequestError(400, CATALOG_API_ERROR_CODES.comboOptionArchived);
  }
}
