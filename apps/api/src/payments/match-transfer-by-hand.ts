import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { isDomainError, vnd } from "@fnb/domain";
import { PAYMENT_ERROR_CODES } from "@fnb/domain/payment";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";
import { PAYMENT_ROUTE_ERROR_CODES as CODES } from "./payment-error-codes";
import { settleIntentWithTransfer } from "./payment-intent-settlement";
import {
  type StoredPaymentIntent,
  paymentIntentSnapshotOf,
  readPaymentIntent,
} from "./payment-intent-store";

export type HandMatchOutcome =
  | { readonly ok: true; readonly intent: StoredPaymentIntent }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

const refused = (status: 404 | 409, code: string): HandMatchOutcome => ({
  ok: false,
  status,
  code,
});

/**
 * A person matches a transfer the system could not (wrong content, a QR that had expired,
 * a code typed by hand) to the QR it pays. The same rules as the automatic match hold: one
 * transfer for one QR, in the QR's own branch, settled by what it brought; only the content
 * and the clock are left to the person's judgement. Who did it goes to the audit trail.
 */
export async function matchTransferByHand(
  client: pg.ClientBase,
  match: { tenantId: string; appUserId: string; transactionId: string; intentId: string },
): Promise<HandMatchOutcome> {
  await lockTenantChangeFeed(client, match.tenantId);
  const { rows } = await client.query<{
    branch_id: string;
    amount: string;
    content: string;
    received_at: Date;
    transfer_type: string;
    claimed: boolean;
  }>(
    "SELECT t.branch_id, t.amount, t.content, t.received_at, t.transfer_type, EXISTS (" +
      "SELECT 1 FROM payment_intent i WHERE i.tenant_id = t.tenant_id " +
      "AND i.matched_transaction_id = t.id) AS claimed FROM bank_transaction t WHERE t.id = $1",
    [match.transactionId],
  );
  const transfer = rows[0];
  if (transfer === undefined) return refused(404, CODES.transactionNotFound);
  if (transfer.transfer_type !== "in" || transfer.claimed) {
    return refused(409, CODES.transactionNotMatchable);
  }
  const intent = await readPaymentIntent(client, match.intentId, true);
  if (intent === null) return refused(404, CODES.intentNotFound);
  if (intent.branchId !== transfer.branch_id) return refused(409, CODES.branchMismatch);
  let settled: StoredPaymentIntent;
  try {
    settled = await settleIntentWithTransfer(client, intent, {
      id: match.transactionId,
      branchId: transfer.branch_id,
      amount: vnd(BigInt(transfer.amount)),
      content: transfer.content,
      receivedAt: transfer.received_at,
    });
  } catch (error) {
    if (isDomainError(error, PAYMENT_ERROR_CODES.invalidIntentTransition)) {
      return refused(409, CODES.intentNotMatchable);
    }
    throw error;
  }
  await appendChange(client, match.tenantId, {
    branchId: settled.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: settled.id,
    snapshot: paymentIntentSnapshotOf(settled),
    commandId: null,
  });
  await appendAudit(client, {
    actor: { kind: "app_user", id: match.appUserId },
    action: "payment.matched_by_hand",
    entityKind: "payment_intent",
    entityId: settled.id,
    payload: { transactionId: match.transactionId, status: settled.status },
  });
  return { ok: true, intent: settled };
}
