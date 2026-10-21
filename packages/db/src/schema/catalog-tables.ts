import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });
const sortOrder = () => integer("sort_order").notNull().default(0);

/** Where a branch makes things (bar, kitchen); kitchen tickets are routed by it. */
export const station = pgTable("station", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
});

export const category = pgTable("category", {
  ...tenantRowColumns(),
  brandId: uuid("brand_id").notNull(),
  name: text("name").notNull(),
  sortOrder: sortOrder(),
});

/** Never deleted: archived_at takes it off the menu while history keeps pointing at it. */
export const product = pgTable("product", {
  ...tenantRowColumns(),
  brandId: uuid("brand_id").notNull(),
  categoryId: uuid("category_id"),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  basePrice: money("base_price"),
  pricingMode: text("pricing_mode").notNull(),
  taxRateBp: integer("tax_rate_bp").notNull().default(0),
  stationId: uuid("station_id"),
  trackStock: boolean("track_stock").notNull().default(false),
  earnsPoints: boolean("earns_points").notNull().default(true),
  printCupLabel: boolean("print_cup_label").notNull().default(false),
  /** `<sha256>.<jpg|png|webp>` in the tenant's media directory; null without a photo. */
  imageKey: text("image_key"),
  archivedAt: at("archived_at"),
});

export const productVariant = pgTable("product_variant", {
  ...tenantRowColumns(),
  productId: uuid("product_id").notNull(),
  name: text("name").notNull(),
  price: money("price"),
  sortOrder: sortOrder(),
  archivedAt: at("archived_at"),
});

export const modifierGroup = pgTable("modifier_group", {
  ...tenantRowColumns(),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull(),
  maxSelect: integer("max_select").notNull(),
  allowDuplicates: boolean("allow_duplicates").notNull().default(false),
});

export const modifierOption = pgTable("modifier_option", {
  ...tenantRowColumns(),
  modifierGroupId: uuid("modifier_group_id").notNull(),
  name: text("name").notNull(),
  priceDelta: money("price_delta").notNull().default(0n),
  maxQuantity: integer("max_quantity"),
  sortOrder: sortOrder(),
  archivedAt: at("archived_at"),
});

export const productModifierGroup = pgTable("product_modifier_group", {
  ...tenantRowColumns(),
  productId: uuid("product_id").notNull(),
  modifierGroupId: uuid("modifier_group_id").notNull(),
  sortOrder: sortOrder(),
});

export const modifierGroupVariantRule = pgTable("modifier_group_variant_rule", {
  ...tenantRowColumns(),
  modifierGroupId: uuid("modifier_group_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  minSelect: integer("min_select"),
  maxSelect: integer("max_select"),
  hidden: boolean("hidden").notNull().default(false),
});

export const comboSlot = pgTable("combo_slot", {
  ...tenantRowColumns(),
  productId: uuid("product_id").notNull(),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull(),
  maxSelect: integer("max_select").notNull(),
  sortOrder: sortOrder(),
});

export const comboSlotOption = pgTable("combo_slot_option", {
  ...tenantRowColumns(),
  comboSlotId: uuid("combo_slot_id").notNull(),
  productId: uuid("product_id").notNull(),
  variantId: uuid("variant_id"),
  upcharge: money("upcharge").notNull().default(0n),
  sortOrder: sortOrder(),
});

/** A manual "86": the product is off at a branch (one channel or all) until a time or for now. */
export const productAvailability = pgTable("product_availability", {
  ...tenantRowColumns(),
  productId: uuid("product_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  channelKey: text("channel_key"),
  unavailableUntil: at("unavailable_until"),
});

export const catalogTables = {
  station,
  category,
  product,
  productVariant,
  modifierGroup,
  modifierOption,
  productModifierGroup,
  modifierGroupVariantRule,
  comboSlot,
  comboSlotOption,
  productAvailability,
};
