import type { Product } from "@fnb/domain";
import { newId } from "@fnb/db";
import type pg from "pg";
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
