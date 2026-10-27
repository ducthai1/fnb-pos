import {
  type Order,
  type OrderChargeProfile,
  type OrderStatus,
  type Quantity,
  type ServiceType,
  type Vnd,
  vnd,
} from "@fnb/domain";
import type { OrderEInvoiceSnapshot } from "@fnb/contracts";
import type pg from "pg";
import { readOrderEInvoiceSnapshot } from "../einvoice/order-einvoice-snapshot";
import { chargeProfileFromStored } from "./charge-profile-snapshot";
import { readRefundAmounts } from "./refund-amounts-store";
import { readStoredOrderLines } from "./stored-order-lines";

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

async function storedOrderOf(client: pg.ClientBase, row: OrderRow): Promise<StoredOrder> {
  const lines = await readStoredOrderLines(client, row.id);
  const payments = await client.query<{
    id: string;
    method: string;
    amount: string;
    received_by_staff_id: string;
    payment_intent_id: string | null;
  }>(
    "SELECT id, method, amount, received_by_staff_id, payment_intent_id FROM payment " +
      "WHERE order_id = $1 " +
      "ORDER BY created_at, id",
    [row.id],
  );
  return {
    order: {
      id: row.id,
      status: row.status as OrderStatus,
      serviceType: row.service_type as ServiceType,
      channelKey: row.channel_key,
      businessDate: row.business_date,
      lines: lines.lines,
      refundOfOrderId: row.refund_of_order_id,
      refundAmounts: await readRefundAmounts(
        client,
        row.id,
        row.refund_prices_include_tax,
        row.refund_service_charge_tax_rate_bp,
      ),
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
    payments: payments.rows.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: vnd(BigInt(payment.amount)),
      receivedByStaffId: payment.received_by_staff_id,
      paymentIntentId: payment.payment_intent_id,
    })),
    sentQuantityByLineId: lines.sentQuantityByLineId,
    sentNoteByLineId: lines.sentNoteByLineId,
    restockByLineId: lines.restockByLineId,
    einvoice: row.status === "draft" ? null : await readOrderEInvoiceSnapshot(client, row.id),
  };
}
