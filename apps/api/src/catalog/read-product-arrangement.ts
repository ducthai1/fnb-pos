import type pg from "pg";
import { type ProductDocumentGroup, type ProductDocumentSlot, amountOf } from "./product-document";

export interface ProductArrangement {
  modifierGroups: ProductDocumentGroup[];
  slots: ProductDocumentSlot[];
}

/** One product's modifier groups (live options, rules for its live variants) and combo slots. */
export async function readProductArrangement(
  client: pg.PoolClient,
  productId: string,
): Promise<ProductArrangement> {
  const arrangements = await readProductArrangements(client, [productId]);
  return arrangements.get(productId) ?? { modifierGroups: [], slots: [] };
}

/**
 * The arrangement of many products in a fixed number of queries, whatever their count: a
 * till's whole menu, or every product sharing a group that just changed, is read inside a
 * transaction that holds the tenant's feed lock, and per-product round trips would hold it
 * for as long as the menu is big.
 */
export async function readProductArrangements(
  client: pg.PoolClient,
  productIds: readonly string[],
): Promise<Map<string, ProductArrangement>> {
  const groups = await client.query<{
    product_id: string;
    id: string;
    name: string;
    min_select: number;
    max_select: number;
    allow_duplicates: boolean;
  }>(
    "SELECT pmg.product_id, g.id, g.name, g.min_select, g.max_select, g.allow_duplicates " +
      "FROM product_modifier_group pmg JOIN modifier_group g ON g.id = pmg.modifier_group_id " +
      "WHERE pmg.product_id = ANY($1::uuid[]) ORDER BY pmg.product_id, pmg.sort_order",
    [productIds],
  );
  const options = await client.query<{
    id: string;
    modifier_group_id: string;
    name: string;
    price_delta: string;
    max_quantity: number | null;
  }>(
    "SELECT id, modifier_group_id, name, price_delta, max_quantity FROM modifier_option " +
      "WHERE modifier_group_id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY sort_order, id",
    [[...new Set(groups.rows.map((group) => group.id))]],
  );
  // A product's rules are those on its own live variants; the group is shared, the rule is not.
  const rules = await client.query<{
    product_id: string;
    modifier_group_id: string;
    variant_id: string;
    min_select: number | null;
    max_select: number | null;
    hidden: boolean;
  }>(
    "SELECT v.product_id, r.modifier_group_id, r.variant_id, r.min_select, r.max_select, r.hidden " +
      "FROM modifier_group_variant_rule r JOIN product_variant v ON v.id = r.variant_id " +
      "WHERE v.product_id = ANY($1::uuid[]) AND v.archived_at IS NULL ORDER BY r.variant_id",
    [productIds],
  );
  const slots = await readSlots(client, productIds);
  const arrangements = new Map<string, ProductArrangement>();
  for (const productId of productIds) {
    const modifierGroups = groups.rows
      .filter((group) => group.product_id === productId)
      .map((group) => ({
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
            .filter((rule) => rule.product_id === productId && rule.modifier_group_id === group.id)
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
    arrangements.set(productId, { modifierGroups, slots: slots.get(productId) ?? [] });
  }
  return arrangements;
}

async function readSlots(
  client: pg.PoolClient,
  productIds: readonly string[],
): Promise<Map<string, ProductDocumentSlot[]>> {
  const slots = await client.query<{
    id: string;
    product_id: string;
    name: string;
    min_select: number;
    max_select: number;
  }>(
    "SELECT id, product_id, name, min_select, max_select FROM combo_slot " +
      "WHERE product_id = ANY($1::uuid[]) ORDER BY sort_order",
    [productIds],
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
  const byProduct = new Map<string, ProductDocumentSlot[]>();
  for (const slot of slots.rows) {
    const list = byProduct.get(slot.product_id) ?? [];
    list.push({
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
    });
    byProduct.set(slot.product_id, list);
  }
  return byProduct;
}
