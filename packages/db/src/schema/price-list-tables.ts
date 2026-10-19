import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });
const scopeIdWhen = (kind: "variant" | "product" | "category") =>
  sql.raw(`CASE WHEN scope_kind = '${kind}' THEN scope_id END`);

export const priceList = pgTable("price_list", {
  ...tenantRowColumns(),
  brandId: uuid("brand_id").notNull(),
  name: text("name").notNull(),
});

/** One rule of a price list; the domain's PriceListItem flattened into columns. */
export const priceListItem = pgTable("price_list_item", {
  ...tenantRowColumns(),
  priceListId: uuid("price_list_id").notNull(),
  scopeKind: text("scope_kind").notNull(),
  scopeId: uuid("scope_id"),
  /** Derived from scope_kind/scope_id by the database, only to carry the foreign keys. */
  variantId: uuid("variant_id").generatedAlwaysAs(scopeIdWhen("variant")),
  productId: uuid("product_id").generatedAlwaysAs(scopeIdWhen("product")),
  categoryId: uuid("category_id").generatedAlwaysAs(scopeIdWhen("category")),
  branchId: uuid("branch_id"),
  channelKey: text("channel_key"),
  validFrom: at("valid_from"),
  validTo: at("valid_to"),
  daysOfWeek: integer("days_of_week").array(),
  startMinute: integer("start_minute"),
  endMinute: integer("end_minute"),
  effectKind: text("effect_kind").notNull(),
  fixedPrice: bigint("fixed_price", { mode: "bigint" }),
  percentOffBp: integer("percent_off_bp"),
  rounding: text("rounding"),
  priority: integer("priority").notNull().default(0),
});

export const priceListTables = { priceList, priceListItem };
