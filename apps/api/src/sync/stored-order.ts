import {
  type Order,
  type OrderChargeProfile,
  type OrderStatus,
  type Quantity,
  type RefundAmounts,
  type ServiceType,
  type Vnd,
  vnd,
} from "@fnb/domain";
import type { OrderEInvoiceSnapshot } from "@fnb/contracts";
import type pg from "pg";
import { readOrderEInvoiceSnapshot } from "../einvoice/order-einvoice-snapshot";
import { chargeProfileFromStored } from "./charge-profile-snapshot";
import { readRefundAmounts, readRefundAmountsOf } from "./refund-amounts-store";
import { type StoredOrderLines, readStoredOrderLines, readStoredOrderLinesOf } from "./stored-order-lines";

/** An order as the server holds it: the domain's Order plus what only the document carries. */
export interface StoredOrder {
  readonly order: Order;
  readonly branchId: string;
  readonly deviceId: string;
  readonly deviceOrderNo: number;
  readonly officialNo: string | null;
  readonly callNumber: string | null;
  readonly tableId: string | null;
  /** The table's name when the order sat down; a counter order's tag instead holds no table. */
  readonly tableName: string | null;
  readonly tableTag: string | null;
  /** A pre-bill was printed for the order as it now stands: its table waits to be paid. */
  readonly preBillPrinted: boolean;
  /** The version a pre-bill was last printed for, if any; below `version`, it changed since. */
  readonly preBillPrintedVersion: number | null;
  /** When the order was opened, as the server decided it. */
  readonly openedAt: Date;
  /** When the order was paid, as the server decided it; null until it is. */
  readonly paidAt: Date | null;
  /** Why a draft was cancelled or a sale refunded. */
  readonly reasonCode: string | null;
  readonly chargeProfile: OrderChargeProfile;
  readonly payments: readonly StoredPayment[];
  readonly sentQuantityByLineId: ReadonlyMap<string, Quantity>;
  readonly sentNoteByLineId: ReadonlyMap<string, string | null>;
  readonly restockByLineId: ReadonlyMap<string, boolean>;
  /** The order's invoice, once a paid order has one queued. */
  readonly einvoice: OrderEInvoiceSnapshot | null;
}

export interface StoredPayment {
  readonly id: string;
  readonly method: string;
  readonly amount: Vnd;
  readonly receivedByStaffId: string;
  /** The QR intent a bank transfer paid with; null for any other money. */
  readonly paymentIntentId: string | null;
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
  table_name_snapshot: string | null;
  table_tag: string | null;
  pre_bill_printed_version: number | null;
  opened_at: Date;
  paid_at: Date | null;
  reason_code: string | null;
  charge_profile: unknown;
  refund_prices_include_tax: boolean | null;
  refund_service_charge_tax_rate_bp: number | null;
}

// business_date as text: node-postgres would turn a date into a Date at local midnight,
// which shifts the business day on a server not running at UTC+7.
const ORDER_COLUMNS =
  "id, branch_id, device_id, device_order_no, status, service_type, channel_key, " +
  "business_date::text AS business_date, version, refund_of_order_id, official_no, call_number, " +
  "table_id, table_name_snapshot, table_tag, pre_bill_printed_version, reason_code, " +
  "coalesce(opened_at, created_at) AS opened_at, paid_at, " +
  "charge_profile, refund_prices_include_tax, " +
  "refund_service_charge_tax_rate_bp";

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
  return row === undefined ? null : storedOrderOf(client, row);
}

/** Every refund of a sale, drafts and cancelled ones included, as buildRefund wants them. */
export async function readRefundsOf(client: pg.ClientBase, saleId: string): Promise<Order[]> {
  const found = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM sales_order WHERE refund_of_order_id = $1 ORDER BY id`,
    [saleId],
  );
  const refunds: Order[] = [];
  for (const row of found.rows) refunds.push((await storedOrderOf(client, row)).order);
  return refunds;
}

interface PaymentRow {
  id: string;
  method: string;
  amount: string;
  received_by_staff_id: string;
  payment_intent_id: string | null;
}

const PAYMENT_COLUMNS = "id, method, amount, received_by_staff_id, payment_intent_id";

async function storedOrderOf(client: pg.ClientBase, row: OrderRow): Promise<StoredOrder> {
  const lines = await readStoredOrderLines(client, row.id);
  const payments = await client.query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM payment WHERE order_id = $1 ORDER BY created_at, id`,
    [row.id],
  );
  const refundAmounts = await readRefundAmounts(
    client,
    row.id,
    row.refund_prices_include_tax,
    row.refund_service_charge_tax_rate_bp,
  );
  const einvoice = row.status === "draft" ? null : await readOrderEInvoiceSnapshot(client, row.id);
  return assembleStoredOrder(row, lines, payments.rows, refundAmounts, einvoice);
}

/**
 * The orders by id in a fixed number of round trips, whatever their number: the orders, their
 * lines, their payments, the amounts of any refund among them (and one invoice read for each
 * order no longer a draft). Each comes out exactly as readStoredOrder reads it alone; ids this
 * tenant has no order for are left out, the rest keep the order of `orderIds`.
 */
export async function readStoredOrdersByIds(
  client: pg.ClientBase,
  orderIds: readonly string[],
): Promise<StoredOrder[]> {
  if (orderIds.length === 0) return [];
  const found = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM sales_order WHERE id = ANY($1::uuid[])`,
    [orderIds],
  );
  const byId = new Map(found.rows.map((row) => [row.id, row]));
  const rows = orderIds.flatMap((id) => byId.get(id) ?? []);
  return storedOrdersOf(client, rows);
}

/** The branch's drafts still open, oldest first, read as readStoredOrdersByIds reads orders. */
export async function readOpenDraftsOfBranch(
  client: pg.ClientBase,
  branchId: string,
): Promise<StoredOrder[]> {
  const found = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM sales_order WHERE branch_id = $1 AND status = 'draft' ` +
      "ORDER BY created_at, id",
    [branchId],
  );
  return storedOrdersOf(client, found.rows);
}

async function storedOrdersOf(client: pg.ClientBase, rows: readonly OrderRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const lines = await readStoredOrderLinesOf(client, ids);
  const payments = await client.query<PaymentRow & { order_id: string }>(
    `SELECT order_id, ${PAYMENT_COLUMNS} FROM payment WHERE order_id = ANY($1::uuid[]) ` +
      "ORDER BY order_id, created_at, id",
    [ids],
  );
  const paymentsByOrder = new Map<string, PaymentRow[]>(ids.map((id) => [id, []]));
  for (const payment of payments.rows) paymentsByOrder.get(payment.order_id)?.push(payment);
  const refunds = await readRefundAmountsOf(
    client,
    rows.map((row) => ({
      orderId: row.id,
      pricesIncludeTax: row.refund_prices_include_tax,
      serviceChargeTaxRateBp: row.refund_service_charge_tax_rate_bp,
    })),
  );
  const orders: StoredOrder[] = [];
  for (const row of rows) {
    const einvoice = row.status === "draft" ? null : await readOrderEInvoiceSnapshot(client, row.id);
    const own = lines.get(row.id);
    if (own === undefined) throw new Error(`no lines read for order ${row.id}`);
    orders.push(
      assembleStoredOrder(row, own, paymentsByOrder.get(row.id) ?? [], refunds.get(row.id) ?? null, einvoice),
    );
  }
  return orders;
}

function assembleStoredOrder(
  row: OrderRow,
  lines: StoredOrderLines,
  payments: readonly PaymentRow[],
  refundAmounts: RefundAmounts | null,
  einvoice: OrderEInvoiceSnapshot | null,
): StoredOrder {
  return {
    order: {
      id: row.id,
      status: row.status as OrderStatus,
      serviceType: row.service_type as ServiceType,
      channelKey: row.channel_key,
      businessDate: row.business_date,
      lines: lines.lines,
      refundOfOrderId: row.refund_of_order_id,
      refundAmounts,
      version: row.version,
    },
    branchId: row.branch_id,
    deviceId: row.device_id,
    deviceOrderNo: Number(row.device_order_no),
    officialNo: row.official_no,
    callNumber: row.call_number,
    tableId: row.table_id,
    tableName: row.table_name_snapshot,
    tableTag: row.table_tag,
    preBillPrinted: row.pre_bill_printed_version === row.version,
    preBillPrintedVersion: row.pre_bill_printed_version,
    openedAt: row.opened_at,
    paidAt: row.paid_at,
    reasonCode: row.reason_code,
    chargeProfile: chargeProfileFromStored(row.charge_profile),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: vnd(BigInt(payment.amount)),
      receivedByStaffId: payment.received_by_staff_id,
      paymentIntentId: payment.payment_intent_id,
    })),
    sentQuantityByLineId: lines.sentQuantityByLineId,
    sentNoteByLineId: lines.sentNoteByLineId,
    restockByLineId: lines.restockByLineId,
    einvoice,
  };
}
