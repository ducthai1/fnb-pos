import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const money = (name: string) => bigint(name, { mode: "bigint" });

/**
 * Quantities are numeric(12,3), read and written as the decimal text pg uses for numeric.
 * A custom type because Drizzle's numeric prints its SQL type as "numeric(12, 3)", which
 * would never match what Postgres reports for the column.
 */
export const quantity = customType<{ data: string; driverData: string }>({
  dataType: () => "numeric(12,3)",
});

/** A closed order (paid, posted, cancelled) cannot be edited; see 0011_orders.sql. */
export const salesOrder = pgTable("sales_order", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  /** The shift the order was settled in; null while it is a draft. */
  shiftId: uuid("shift_id"),
  status: text("status").notNull(),
  serviceType: text("service_type").notNull(),
  channelKey: text("channel_key"),
  businessDate: date("business_date").notNull(),
  refundOfOrderId: uuid("refund_of_order_id"),
  deviceOrderNo: bigint("device_order_no", { mode: "number" }).notNull(),
  officialNo: text("official_no"),
  callNumber: text("call_number"),
  tableId: uuid("table_id"),
  tableNameSnapshot: text("table_name_snapshot"),
  tableTag: text("table_tag"),
  preBillPrintedVersion: integer("pre_bill_printed_version"),
  chargeProfile: jsonb("charge_profile").notNull(),
  refundPricesIncludeTax: boolean("refund_prices_include_tax"),
  refundServiceChargeTaxRateBp: integer("refund_service_charge_tax_rate_bp"),
  reasonCode: text("reason_code"),
  /** When the till took the money, by its clock; null while a draft. */
  paidAt: timestamp("paid_at", { withTimezone: true }),
  /** What the customer asked to be printed on the invoice, while a draft. */
  einvoiceBuyer: jsonb("einvoice_buyer"),
});

export const salesOrderLine = pgTable("sales_order_line", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  position: integer("position").notNull(),
  parentLineId: uuid("parent_line_id"),
  lineType: text("line_type").notNull(),
  productId: uuid("product_id"),
  variantId: uuid("variant_id"),
  modifierOptionId: uuid("modifier_option_id"),
  nameSnapshot: text("name_snapshot").notNull(),
  unitPrice: money("unit_price").notNull(),
  quantity: quantity("quantity").notNull(),
  taxRateBp: integer("tax_rate_bp").notNull(),
  note: text("note"),
  priceSource: text("price_source").notNull(),
  reversesLineId: uuid("reverses_line_id"),
  sentQuantity: quantity("sent_quantity").notNull().default("0"),
  sentNote: text("sent_note"),
  wholeParentLine: boolean("whole_parent_line").notNull().default(false),
  restock: boolean("restock"),
});

export const refundLineAmount = pgTable("refund_line_amount", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  lineId: uuid("line_id").notNull(),
  soldLineId: uuid("sold_line_id").notNull(),
  gross: money("gross").notNull(),
  discountAllocated: money("discount_allocated").notNull(),
  tax: money("tax").notNull(),
  serviceCharge: money("service_charge").notNull(),
  serviceChargeTax: money("service_charge_tax").notNull(),
});

export const payment = pgTable("payment", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  method: text("method").notNull(),
  amount: money("amount").notNull(),
  receivedByStaffId: uuid("received_by_staff_id").notNull(),
  shiftId: uuid("shift_id"),
  recordedAfterShiftClose: boolean("recorded_after_shift_close").notNull().default(false),
  paymentIntentId: uuid("payment_intent_id"),
});

export const lineVoidRecord = pgTable("line_void_record", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  lineId: uuid("line_id").notNull(),
  quantity: quantity("quantity").notNull(),
  fromUnsent: quantity("from_unsent").notNull(),
  fromSent: quantity("from_sent").notNull(),
  reasonCode: text("reason_code").notNull(),
  staffId: uuid("staff_id").notNull(),
  approvedByStaffId: uuid("approved_by_staff_id"),
  approvalId: uuid("approval_id"),
  reversalLineId: uuid("reversal_line_id"),
});

/** A closed shift cannot be edited; see 0014_shift_and_cash.sql. */
export const shift = pgTable("shift", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  deviceId: uuid("device_id"),
  status: text("status").notNull(),
  openedByStaffId: uuid("opened_by_staff_id").notNull(),
  openingCash: money("opening_cash").notNull(),
  businessDate: date("business_date").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByStaffId: uuid("closed_by_staff_id"),
  countedCash: money("counted_cash"),
  expectedCash: money("expected_cash"),
  difference: money("difference"),
  closeApprovalId: uuid("close_approval_id"),
  openOrdersCarried: integer("open_orders_carried"),
});

export const orderTables = {
  salesOrder,
  salesOrderLine,
  refundLineAmount,
  payment,
  lineVoidRecord,
  shift,
};
