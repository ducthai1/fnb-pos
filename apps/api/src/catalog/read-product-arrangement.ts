import type pg from "pg";
import { type ProductDocumentGroup, type ProductDocumentSlot, amountOf } from "./product-document";

/** The product's modifier groups (live options, rules for its live variants) and combo slots. */
export async function readProductArrangement(
  client: pg.PoolClient,
  productId: string,
  variantIds: readonly string[],
): Promise<{ modifierGroups: ProductDocumentGroup[]; slots: ProductDocumentSlot[] }> {
  const groups = await client.query<{
    id: string;
    name: string;
    min_select: number;
    max_select: number;
    allow_duplicates: boolean;
  }>(
    "SELECT g.id, g.name, g.min_select, g.max_select, g.allow_duplicates " +
      "FROM product_modifier_group pmg JOIN modifier_group g ON g.id = pmg.modifier_group_id " +
      "WHERE pmg.product_id = $1 ORDER BY pmg.sort_order",
    [productId],
  );
  const groupIds = groups.rows.map((group) => group.id);
  const options = await client.query<{
    id: string;
    modifier_group_id: string;
    name: string;
    price_delta: string;
    max_quantity: number | null;
  }>(
    "SELECT id, modifier_group_id, name, price_delta, max_quantity FROM modifier_option " +
      "WHERE modifier_group_id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY sort_order, id",
    [groupIds],
  );
  const rules = await client.query<{
    modifier_group_id: string;
    variant_id: string;
    min_select: number | null;
    max_select: number | null;
    hidden: boolean;
  }>(
    "SELECT modifier_group_id, variant_id, min_select, max_select, hidden " +
      "FROM modifier_group_variant_rule " +
      "WHERE modifier_group_id = ANY($1::uuid[]) AND variant_id = ANY($2::uuid[]) " +
      "ORDER BY variant_id",
    [groupIds, variantIds],
  );
  const modifierGroups = groups.rows.map((group) => ({
    id: group.id,
    name: group.name,
    minSelect: group.min_select,
    maxSelect: group.max_select,
    allowDuplicates: group.allow_duplicates,
    options: options.rows
      .filter((option) => option.modifier_group_id === group.id)
      .map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: amountOf(option.price_delta),
        maxQuantity: option.max_quantity,
      })),
    // Unset limits are left out, as they were sent: they inherit the group's.
    variantRules: Object.fromEntries(
      rules.rows
        .filter((rule) => rule.modifier_group_id === group.id)
        .map((rule) => [
          rule.variant_id,
          {
            ...(rule.min_select === null ? {} : { minSelect: rule.min_select }),
            ...(rule.max_select === null ? {} : { maxSelect: rule.max_select }),
            ...(rule.hidden ? { hidden: true as const } : {}),
          },
        ]),
    ),
  }));
  return { modifierGroups, slots: await readSlots(client, productId) };
}

async function readSlots(client: pg.PoolClient, productId: string): Promise<ProductDocumentSlot[]> {
  const slots = await client.query<{
    id: string;
    name: string;
    min_select: number;
    max_select: number;
  }>(
    "SELECT id, name, min_select, max_select FROM combo_slot WHERE product_id = $1 ORDER BY sort_order",
    [productId],
  );
  const options = await client.query<{
    combo_slot_id: string;
    product_id: string;
    variant_id: string | null;
    upcharge: string;
  }>(
    "SELECT combo_slot_id, product_id, variant_id, upcharge FROM combo_slot_option " +
      "WHERE combo_slot_id = ANY($1::uuid[]) ORDER BY sort_order",
    [slots.rows.map((slot) => slot.id)],
  );
  return slots.rows.map((slot) => ({
    id: slot.id,
    name: slot.name,
    minSelect: slot.min_select,
    maxSelect: slot.max_select,
    options: options.rows
      .filter((option) => option.combo_slot_id === slot.id)
      .map((option) => ({
        productId: option.product_id,
        variantId: option.variant_id,
        upcharge: amountOf(option.upcharge),
      })),
  }));
}
