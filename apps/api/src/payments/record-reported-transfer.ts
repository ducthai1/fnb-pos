import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { transitionPaymentIntent } from "@fnb/domain/payment";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";
import type { ReportedTransfer } from "./gateways/payment-gateway-adapter";
import {
  type ArrivedTransfer,
  codeNamedBy,
  settleIntentWithTransfer,
  transferPaysIntent,
} from "./payment-intent-settlement";
import {
  INTENT_COLUMNS,
  type PaymentIntentRow,
  type StoredPaymentIntent,
  intentOfRow,
  paymentIntentSnapshotOf,
  setIntentStatus,
} from "./payment-intent-store";

export interface TransferReport {
  readonly tenantId: string;
  /** The branch whose secret proved the notice: the account the money went into. */
  readonly branchId: string;
  readonly gateway: string;
  readonly transfer: ReportedTransfer;
  readonly raw: unknown;
  readonly receivedAt: Date;
}

/**
 * Keeps a reported transfer and matches it, in the caller's tenant transaction. A notice
 * delivered again (gateways retry until answered, and may send twice anyway) finds its
 * reference already kept and changes nothing, so ten deliveries are one payment. Answers
 * whether this delivery was the first.
 */
export async function recordReportedTransfer(
  client: pg.ClientBase,
  report: TransferReport,
): Promise<boolean> {
  // Taken before the insert: a copy of the notice arriving at the same moment waits here,
  // then finds the row, and a till creating the matching intent cannot slip in between.
  await lockTenantChangeFeed(client, report.tenantId);
  const { transfer } = report;
  const id = newId();
  const inserted = await client.query(
    "INSERT INTO bank_transaction (id, tenant_id, branch_id, gateway, reference_code, amount, " +
      "content, transfer_type, occurred_at, received_at, raw) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
      "ON CONFLICT ON CONSTRAINT bank_transaction_once_per_gateway_reference DO NOTHING",
    [
      id,
      report.tenantId,
      report.branchId,
      report.gateway,
      transfer.referenceCode,
      transfer.amount,
      transfer.content,
      transfer.transferType,
      transfer.occurredAt,
      report.receivedAt,
      JSON.stringify(report.raw ?? null),
    ],
  );
  if (inserted.rowCount === 0) return false;
  if (transfer.transferType === "in") {
    const { branchId, receivedAt } = report;
    const arrived = {
      id,
      branchId,
      amount: transfer.amount,
      content: transfer.content,
      receivedAt,
    };
    await matchArrivedTransfer(client, report.tenantId, arrived);
  }
  return true;
}

/**
 * Matches money that just arrived to the pending QR its content names. A transfer naming a
 * QR whose time ran out expires that QR and waits for a person; one naming no live QR, or a
 * QR of another branch's account, just waits.
 */
async function matchArrivedTransfer(
  client: pg.ClientBase,
  tenantId: string,
  transfer: ArrivedTransfer,
): Promise<void> {
  const code = codeNamedBy(transfer.content);
  if (code === null) return;
  const { rows } = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE content_code = $1 ` +
      "AND status = 'pending' FOR UPDATE",
    [code],
  );
  if (rows[0] === undefined) return;
  const intent = intentOfRow(rows[0]);
  let after: StoredPaymentIntent;
  if (transferPaysIntent(transfer, intent)) {
    after = await settleIntentWithTransfer(client, intent, transfer);
  } else if (
    intent.branchId === transfer.branchId &&
    transfer.receivedAt.getTime() >= intent.expiresAt.getTime()
  ) {
    after = await setIntentStatus(
      client,
      intent,
      transitionPaymentIntent(intent.status, "expired"),
    );
  } else {
    return;
  }
  await appendChange(client, tenantId, {
    branchId: after.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: after.id,
    snapshot: paymentIntentSnapshotOf(after),
    commandId: null,
  });
}
