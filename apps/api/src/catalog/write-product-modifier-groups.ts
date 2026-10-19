import type { ModifierGroup, Product } from "@fnb/domain";
import { newId } from "@fnb/db";
import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";
import { type CatalogWriteContext, insertCatalogRow, updateCatalogRow } from "./catalog-row-writes";

/**
 * Saves the product's modifier groups. A group is shared by every product it is attached
 * to, so saving it here updates it there too; that is what lets a shop edit "Toppings"
 * once. The attachments and this product's variant rules are replaced wholesale.
 */
export async function writeProductModifierGroups(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  product: Product,
): Promise<void> {
  for (const group of product.modifierGroups) await writeGroup(client, context, group);

  await client.query("DELETE FROM product_modifier_group WHERE product_id = $1", [product.id]);
  await client.query(
    "DELETE FROM modifier_group_variant_rule " +
      "WHERE variant_id IN (SELECT id FROM product_variant WHERE product_id = $1)",
    [product.id],
  );
  for (const [index, group] of product.modifierGroups.entries()) {
    await insertCatalogRow(client, "product_modifier_group", context, {
      id: newId(),
      product_id: product.id,
      modifier_group_id: group.id,
      sort_order: index,
    });
    for (const [variantId, rule] of Object.entries(group.variantRules)) {
      await insertCatalogRow(client, "modifier_group_variant_rule", context, {
        id: newId(),
        modifier_group_id: group.id,
        variant_id: variantId,
        min_select: rule.minSelect ?? null,
        max_select: rule.maxSelect ?? null,
        hidden: rule.hidden ?? false,
      });
    }
  }
}

async function writeGroup(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  group: ModifierGroup,
): Promise<void> {
  const cells = {
    name: group.name,
    min_select: group.minSelect,
    max_select: group.maxSelect,
    allow_duplicates: group.allowDuplicates,
  };
  const found = await client.query("SELECT 1 FROM modifier_group WHERE id = $1 FOR UPDATE", [
    group.id,
  ]);
  if (found.rowCount === 0) {
    await insertCatalogRow(client, "modifier_group", context, { id: group.id, ...cells });
  } else {
    await updateCatalogRow(client, "modifier_group", context, group.id, cells);
  }

  const ids = group.options.map((option) => option.id);
  const existing = await client.query<{ id: string; modifier_group_id: string }>(
    "SELECT id, modifier_group_id FROM modifier_option WHERE id = ANY($1::uuid[]) FOR UPDATE",
    [ids],
  );
  if (existing.rows.some((row) => row.modifier_group_id !== group.id)) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.idConflict);
  }
  const stored = new Set(existing.rows.map((row) => row.id));
  for (const [index, option] of group.options.entries()) {
    const optionCells = {
      name: option.name,
      price_delta: option.priceDelta,
      max_quantity: option.maxQuantity,
      sort_order: index,
      archived_at: null,
    };
    if (stored.has(option.id)) {
      await updateCatalogRow(client, "modifier_option", context, option.id, optionCells);
    } else {
      await insertCatalogRow(client, "modifier_option", context, {
        id: option.id,
        modifier_group_id: group.id,
        ...optionCells,
      });
    }
  }
  await client.query(
    "UPDATE modifier_option SET archived_at = $2, updated_at = $2, version = version + 1 " +
      "WHERE modifier_group_id = $1 AND archived_at IS NULL AND NOT (id = ANY($3::uuid[]))",
    [group.id, context.now, ids],
  );
}
