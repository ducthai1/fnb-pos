import {
  type Order,
  type OrderChargeProfile,
  type OrderLine,
  type OrderLineType,
  type OrderStatus,
  type PriceSource,
  type ServiceType,
  type Vnd,
  basisPoints,
  quantity,
  vnd,
} from "@fnb/domain";
import type pg from "pg";
import { chargeProfileFromStored } from "./charge-profile-snapshot";

/** An order as the server holds it: the domain's Order plus what only the document carries. */
export interface StoredOrder {
  readonly order: Order;
  readonly branchId: string;
  readonly deviceId: string;
  readonly deviceOrderNo: number;
  readonly officialNo: string | null;
  readonly callNumber: string | null;
  readonly tableId: string | null;
  readonly chargeProfile: OrderChargeProfile;
  readonly payments: readonly StoredPayment[];
}

export interface StoredPayment {
  readonly id: string;
  readonly method: string;
  readonly amount: Vnd;
  readonly receivedByStaffId: string;
}

interface OrderRow {
  id: string;
  branch_id: string;
  device_id: string;
  device_order_no: string;
  status: string;
  service_type: string;
  channel_key: string | null;
  business_date: string;
  version: number;
  refund_of_order_id: string | null;
  official_no: string | null;
  call_number: string | null;
  table_id: string | null;
  charge_profile: unknown;
}

interface LineRow {
  id: string;
  parent_line_id: string | null;
  line_type: string;
  product_id: string | null;
  variant_id: string | null;
  modifier_option_id: string | null;
  name_snapshot: string;
  unit_price: string;
  quantity: string;
  tax_rate_bp: number;
  note: string | null;
  price_source: string;
  reverses_line_id: string | null;
}

// business_date as text: node-postgres would turn a date into a Date at local midnight,
// which shifts the business day on a server not running at UTC+7.
const ORDER_COLUMNS =
  "id, branch_id, device_id, device_order_no, status, service_type, channel_key, " +
  "business_date::text AS business_date, version, refund_of_order_id, official_no, call_number, " +
  "table_id, charge_profile";

/**
 * The order with its lines and payments, or null when this tenant has no order by that id.
 * `forUpdate` locks the order row, for a command that is about to change it.
 */
export async function readStoredOrder(
  client: pg.ClientBase,
  orderId: string,
  forUpdate: boolean,
): Promise<StoredOrder | null> {
  const found = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM sales_order WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  const row = found.rows[0];
  if (row === undefined) return null;
  const lines = await client.query<LineRow>(
    "SELECT * FROM sales_order_line WHERE order_id = $1 ORDER BY position, id",
    [orderId],
  );
  const payments = await client.query<{
    id: string;
    method: string;
    amount: string;
    received_by_staff_id: string;
  }>(
    "SELECT id, method, amount, received_by_staff_id FROM payment WHERE order_id = $1 " +
      "ORDER BY created_at, id",
    [orderId],
  );
  return {
    order: {
      id: row.id,
      status: row.status as OrderStatus,
      serviceType: row.service_type as ServiceType,
      channelKey: row.channel_key,
      businessDate: row.business_date,
      lines: lines.rows.map(lineOf),
      refundOfOrderId: row.refund_of_order_id,
      // No command builds a refund yet; reading refund_line_amount comes with that command.
      refundAmounts: null,
      version: row.version,
    },
    branchId: row.branch_id,
    deviceId: row.device_id,
    deviceOrderNo: Number(row.device_order_no),
    officialNo: row.official_no,
    callNumber: row.call_number,
    tableId: row.table_id,
    chargeProfile: chargeProfileFromStored(row.charge_profile),
    payments: payments.rows.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: vnd(BigInt(payment.amount)),
      receivedByStaffId: payment.received_by_staff_id,
    })),
  };
}

// The text columns hold only the values their CHECK constraints allow.
function lineOf(row: LineRow): OrderLine {
  return {
    id: row.id,
    parentLineId: row.parent_line_id,
    lineType: row.line_type as OrderLineType,
    productId: row.product_id,
    variantId: row.variant_id,
    modifierOptionId: row.modifier_option_id,
    nameSnapshot: row.name_snapshot,
    unitPrice: vnd(BigInt(row.unit_price)),
    quantity: quantity(row.quantity),
    taxRate: basisPoints(row.tax_rate_bp),
    note: row.note,
    priceSource: row.price_source as PriceSource,
    reversesLineId: row.reverses_line_id,
  };
}
