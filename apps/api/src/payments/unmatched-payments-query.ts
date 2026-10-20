import type { UnmatchedPayments } from "@fnb/contracts";
import { moneyToWire } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import type pg from "pg";
import {
  INTENT_COLUMNS,
  type PaymentIntentRow,
  intentOfRow,
  paymentIntentSnapshotOf,
} from "./payment-intent-store";

/** Enough for a day of trouble at a busy branch; older ones are for the reconciliation. */
const LISTED = 200;

const ORDER_IS_OPEN =
  "EXISTS (SELECT 1 FROM sales_order o WHERE o.tenant_id = payment_intent.tenant_id " +
  "AND o.id = payment_intent.order_id AND o.status = 'draft')";

/**
 * Whether the money the bank brought for a payment_intent row is the customer's: it came
 * (settled), no payment uses it, and no till can still close its order with it (an exact
 * one of an open order is the till's to use). Handed back or not is asked apart.
 */
export const NO_SALE_COUNTS_IT =
  "(payment_intent.status IN ('paid', 'partial', 'overpaid') AND NOT EXISTS (SELECT 1 " +
  "FROM payment p WHERE p.tenant_id = payment_intent.tenant_id " +
  "AND p.payment_intent_id = payment_intent.id) " +
  `AND NOT (payment_intent.status = 'paid' AND ${ORDER_IS_OPEN}))`;

/**
 * The branch's transfers in that no QR claimed, newest first, and the QRs of open orders
 * still waiting for money (pending, or expired before any came), for a person to pair them
 * up. Beside them, the money the bank brought that no order counts, for a person to refund:
 * a QR settled short or over (no payment can use it), or paid exactly for an order that
 * was then paid another way or cancelled, until a person hands it back. An exact one of an
 * open order is left out: the till closes the order with it.
 */
export async function readUnmatchedPayments(
  client: pg.ClientBase,
  branchId: string,
): Promise<UnmatchedPayments> {
  const transfers = await client.query<{
    id: string;
    gateway: string;
    amount: string;
    content: string;
    occurred_at: Date;
    received_at: Date;
  }>(
    "SELECT t.id, t.gateway, t.amount, t.content, t.occurred_at, t.received_at " +
      "FROM bank_transaction t WHERE t.branch_id = $1 AND t.transfer_type = 'in' " +
      "AND NOT EXISTS (SELECT 1 FROM payment_intent i WHERE i.tenant_id = t.tenant_id " +
      "AND i.matched_transaction_id = t.id) ORDER BY t.received_at DESC, t.id DESC LIMIT $2",
    [branchId, LISTED],
  );
  const intents = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE branch_id = $1 ` +
      `AND status IN ('pending', 'expired') AND ${ORDER_IS_OPEN} ` +
      "ORDER BY created_at DESC, id DESC LIMIT $2",
    [branchId, LISTED],
  );
  const refundDue = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE branch_id = $1 ` +
      `AND ${NO_SALE_COUNTS_IT} AND refunded_at IS NULL ` +
      "ORDER BY matched_at DESC, id DESC LIMIT $2",
    [branchId, LISTED],
  );
  return {
    transfers: transfers.rows.map((row) => ({
      id: row.id,
      gateway: row.gateway,
      amount: moneyToWire(vnd(BigInt(row.amount))),
      content: row.content,
      occurredAt: row.occurred_at.toISOString(),
      receivedAt: row.received_at.toISOString(),
    })),
    openIntents: intents.rows.map((row) => paymentIntentSnapshotOf(intentOfRow(row))),
    refundDue: refundDue.rows.map((row) => paymentIntentSnapshotOf(intentOfRow(row))),
  };
}
