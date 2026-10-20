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

/**
 * The branch's transfers in that no QR claimed, newest first, and the QRs still waiting
 * for money (pending, or expired before any came), for a person to pair them up.
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
      "AND status IN ('pending', 'expired') ORDER BY created_at DESC, id DESC LIMIT $2",
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
  };
}
