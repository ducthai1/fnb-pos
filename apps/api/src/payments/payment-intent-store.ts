import { type PaymentIntentSnapshot, moneyToWire } from "@fnb/contracts";
import { type Vnd, vnd } from "@fnb/domain";
import type { PaymentIntentStatus } from "@fnb/domain/payment";
import type pg from "pg";

/** A payment intent as the server holds it. */
export interface StoredPaymentIntent {
  readonly id: string;
  readonly orderId: string;
  readonly branchId: string;
  readonly amount: Vnd;
  readonly contentCode: string;
  readonly status: PaymentIntentStatus;
  readonly expiresAt: Date;
  readonly matchedTransactionId: string | null;
  readonly receivedAmount: Vnd | null;
  readonly version: number;
}

export interface PaymentIntentRow {
  id: string;
  order_id: string;
  branch_id: string;
  amount: string;
  content_code: string;
  status: string;
  expires_at: Date;
  matched_transaction_id: string | null;
  received_amount: string | null;
  version: number;
}

export const INTENT_COLUMNS =
  "id, order_id, branch_id, amount, content_code, status, expires_at, " +
  "matched_transaction_id, received_amount, version";

export function intentOfRow(row: PaymentIntentRow): StoredPaymentIntent {
  return {
    id: row.id,
    orderId: row.order_id,
    branchId: row.branch_id,
    amount: vnd(BigInt(row.amount)),
    contentCode: row.content_code,
    status: row.status as PaymentIntentStatus,
    expiresAt: row.expires_at,
    matchedTransactionId: row.matched_transaction_id,
    receivedAmount: row.received_amount === null ? null : vnd(BigInt(row.received_amount)),
    version: row.version,
  };
}

/** One intent of the tenant, locked for the rest of the transaction when `lock`. */
export async function readPaymentIntent(
  client: pg.ClientBase,
  id: string,
  lock: boolean,
): Promise<StoredPaymentIntent | null> {
  const { rows } = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  return rows[0] === undefined ? null : intentOfRow(rows[0]);
}

/** The intents of `orderId` with `status`, locked, oldest first. */
export async function readIntentsOfOrder(
  client: pg.ClientBase,
  orderId: string,
  status: PaymentIntentStatus,
): Promise<StoredPaymentIntent[]> {
  const { rows } = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE order_id = $1 AND status = $2 ` +
      "ORDER BY id FOR UPDATE",
    [orderId, status],
  );
  return rows.map(intentOfRow);
}

/** Moves an intent to `status` without a transfer (expired, withdrawn); returns it as now. */
export async function setIntentStatus(
  client: pg.ClientBase,
  intent: StoredPaymentIntent,
  status: PaymentIntentStatus,
): Promise<StoredPaymentIntent> {
  const { rows } = await client.query<PaymentIntentRow>(
    "UPDATE payment_intent SET status = $2, version = version + 1, updated_at = now() " +
      `WHERE id = $1 RETURNING ${INTENT_COLUMNS}`,
    [intent.id, status],
  );
  if (rows[0] === undefined) throw new Error(`payment intent ${intent.id} vanished`);
  return intentOfRow(rows[0]);
}

/** The intent as tills see it, in the change feed and in the answer to their commands. */
export function paymentIntentSnapshotOf(intent: StoredPaymentIntent): PaymentIntentSnapshot {
  return {
    id: intent.id,
    orderId: intent.orderId,
    branchId: intent.branchId,
    amount: moneyToWire(intent.amount),
    contentCode: intent.contentCode,
    status: intent.status,
    expiresAt: intent.expiresAt.toISOString(),
    receivedAmount: intent.receivedAmount === null ? null : moneyToWire(intent.receivedAmount),
    version: intent.version,
  };
}
