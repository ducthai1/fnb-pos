import { type Vnd, vnd } from "@fnb/domain";
import { contentCodesIn, settlePaymentIntent } from "@fnb/domain/payment";
import type pg from "pg";
import {
  INTENT_COLUMNS,
  type PaymentIntentRow,
  type StoredPaymentIntent,
  intentOfRow,
} from "./payment-intent-store";

/** Money a gateway reported coming into a branch's account. */
export interface ArrivedTransfer {
  readonly id: string;
  readonly branchId: string;
  readonly amount: Vnd;
  readonly content: string;
  readonly receivedAt: Date;
}

/**
 * The one transfer code a transfer's content names, or null. Content naming two codes is
 * left for a person: guessing which QR the customer meant could pay the wrong order.
 */
export function codeNamedBy(content: string): string | null {
  const codes = contentCodesIn(content);
  return codes.length === 1 ? (codes[0] ?? null) : null;
}

/**
 * Whether a transfer pays `intent` by itself: it went into the intent's branch, names its
 * code alone, and reached the server before the QR expired. Arrival is the server's time,
 * so a till that showed the QR offline and synced later still gets the transfer matched.
 */
export function transferPaysIntent(transfer: ArrivedTransfer, intent: StoredPaymentIntent) {
  return (
    transfer.branchId === intent.branchId &&
    codeNamedBy(transfer.content) === intent.contentCode &&
    transfer.receivedAt.getTime() < intent.expiresAt.getTime()
  );
}

/** Matches `transfer` to `intent`, settled by what it brought; returns the intent as now. */
export async function settleIntentWithTransfer(
  client: pg.ClientBase,
  intent: StoredPaymentIntent,
  transfer: ArrivedTransfer,
): Promise<StoredPaymentIntent> {
  const status = settlePaymentIntent(intent.status, intent.amount, transfer.amount);
  const { rows } = await client.query<PaymentIntentRow>(
    "UPDATE payment_intent SET status = $2, matched_transaction_id = $3, received_amount = $4, " +
      "matched_at = now(), updated_at = now(), version = version + 1 " +
      `WHERE id = $1 RETURNING ${INTENT_COLUMNS}`,
    [intent.id, status, transfer.id, transfer.amount],
  );
  if (rows[0] === undefined) throw new Error(`payment intent ${intent.id} vanished`);
  return intentOfRow(rows[0]);
}

/**
 * Transfers into `branchId` that no intent has claimed, received from `from` up to (not
 * including) `until`, oldest first. Money that went out is never a payment.
 */
export async function unclaimedTransfers(
  client: pg.ClientBase,
  branchId: string,
  from: Date,
  until: Date,
): Promise<ArrivedTransfer[]> {
  const { rows } = await client.query<{
    id: string;
    branch_id: string;
    amount: string;
    content: string;
    received_at: Date;
  }>(
    "SELECT t.id, t.branch_id, t.amount, t.content, t.received_at FROM bank_transaction t " +
      "WHERE t.branch_id = $1 AND t.transfer_type = 'in' AND t.received_at >= $2 " +
      "AND t.received_at < $3 AND NOT EXISTS (SELECT 1 FROM payment_intent i " +
      "WHERE i.tenant_id = t.tenant_id AND i.matched_transaction_id = t.id) " +
      "ORDER BY t.received_at, t.id",
    [branchId, from, until],
  );
  return rows.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    amount: vnd(BigInt(row.amount)),
    content: row.content,
    receivedAt: row.received_at,
  }));
}
