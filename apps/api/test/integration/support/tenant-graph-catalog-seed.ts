import {
  category,
  comboSlot,
  comboSlotOption,
  drizzleFor,
  modifierGroup,
  modifierGroupVariantRule,
  modifierOption,
  priceList,
  priceListItem,
  product,
  productAvailability,
  productModifierGroup,
  productVariant,
  station,
} from "@fnb/db";
import type pg from "pg";

export interface CatalogSeedIds {
  brand: string;
  branch: string;
  station: string;
  category: string;
  product: string;
  product_variant: string;
  modifier_group: string;
  modifier_option: string;
  product_modifier_group: string;
  modifier_group_variant_rule: string;
  combo_slot: string;
  combo_slot_option: string;
  product_availability: string;
  price_list: string;
  price_list_item: string;
}

/** One row in every menu and price list table, hanging off the tenant graph's brand and branch. */
export async function seedCatalogRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: CatalogSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  await db.insert(station).values({ id: ids.station, tenantId, branchId: ids.branch, name: "Bar" });
  await db
    .insert(category)
    .values({ id: ids.category, tenantId, brandId: ids.brand, name: "Trà sữa" });
  await db.insert(product).values({
    id: ids.product,
    tenantId,
    brandId: ids.brand,
    categoryId: ids.category,
    stationId: ids.station,
    kind: "prepared_drink",
    name: "Trà sữa trân châu",
    basePrice: 35_000n,
    pricingMode: "fixed",
  });
  await db
    .insert(productVariant)
    .values({ id: ids.product_variant, tenantId, productId: ids.product, name: "L" });
  await db
    .insert(modifierGroup)
    .values({ id: ids.modifier_group, tenantId, name: "Topping", minSelect: 0, maxSelect: 3 });
  await db.insert(modifierOption).values({
    id: ids.modifier_option,
    tenantId,
    modifierGroupId: ids.modifier_group,
    name: "Trân châu",
    priceDelta: 5_000n,
  });
  await db.insert(productModifierGroup).values({
    id: ids.product_modifier_group,
    tenantId,
    productId: ids.product,
    modifierGroupId: ids.modifier_group,
  });
  await db.insert(modifierGroupVariantRule).values({
    id: ids.modifier_group_variant_rule,
    tenantId,
    modifierGroupId: ids.modifier_group,
    variantId: ids.product_variant,
    maxSelect: 5,
  });
  await db.insert(comboSlot).values({
    id: ids.combo_slot,
    tenantId,
    productId: ids.product,
    name: "Đồ uống",
    minSelect: 1,
    maxSelect: 1,
  });
  await db.insert(comboSlotOption).values({
    id: ids.combo_slot_option,
    tenantId,
    comboSlotId: ids.combo_slot,
    productId: ids.product,
    variantId: ids.product_variant,
  });
  await db.insert(productAvailability).values({
    id: ids.product_availability,
    tenantId,
    productId: ids.product,
    branchId: ids.branch,
  });
  await db
    .insert(priceList)
    .values({ id: ids.price_list, tenantId, brandId: ids.brand, name: "Giá Grab" });
  await db.insert(priceListItem).values({
    id: ids.price_list_item,
    tenantId,
    priceListId: ids.price_list,
    scopeKind: "variant",
    scopeId: ids.product_variant,
    channelKey: "grab",
    effectKind: "fixed_price",
    fixedPrice: 52_000n,
  });
}
