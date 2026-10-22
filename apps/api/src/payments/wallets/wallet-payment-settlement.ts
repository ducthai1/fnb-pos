import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../../sync/change-feed";
import { settleIntentWithTransfer } from "../payment-intent-settlement";
import {
  INTENT_COLUMNS,
  type PaymentIntentRow,
  type StoredPaymentIntent,
  intentOfRow,
  paymentIntentSnapshotOf,
} from "../payment-intent-store";
import type { WalletPaymentReport } from "./wallet-gateway-adapter";

export interface WalletPaymentArrival {
  readonly tenantId: string;
  /** The branch whose keys proved the report: the account the money went into. */
  readonly branchId: string;
  readonly wallet: string;
  readonly report: WalletPaymentReport;
  /** "callback" or "query": how the server learned of it, kept with the evidence. */
  readonly heardBy: "callback" | "query";
  readonly raw: unknown;
  readonly receivedAt: Date;
}

/**
 * The pending wallet intent at `gatewayRef`, locked when `lock` (only after the tenant's
 * change feed lock, which every writer of intents takes first); null when none is pending.
 */
export async function pendingWalletIntent(
  client: pg.ClientBase,
  wallet: string,
  gatewayRef: string,
  lock: boolean,
): Promise<StoredPaymentIntent | null> {
  const { rows } = await client.query<PaymentIntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM payment_intent WHERE wallet = $1 AND gateway_ref = $2 ` +
      `AND status = 'pending'${lock ? " FOR UPDATE" : ""}`,
    [wallet, gatewayRef],
  );
  return rows[0] === undefined ? null : intentOfRow(rows[0]);
}

/**
 * Keeps a wallet payment the server proved (by the wallet's notice or by asking it), and
 * settles the intent it names, in the caller's tenant transaction. The callback and the
 * poller go through here alike: the payment is kept once per wallet and gateway ref, so
 * the second one to arrive (or a notice delivered again) changes nothing. The amount
 * settles the intent the way a bank transfer does (paid exactly, partial or overpaid, by
 * the domain), so money that differs from the intent's never closes the order by itself.
 * A payment for no pending intent of the branch (unknown, expired, withdrawn) is kept, not
 * applied: it waits in the list of money no sale counts, for a person. Answers whether
 * this report was the first.
 */
export async function settleWalletPayment(
  client: pg.ClientBase,
  arrival: WalletPaymentArrival,
): Promise<boolean> {
  await lockTenantChangeFeed(client, arrival.tenantId);
  const { report } = arrival;
  const id = newId();
  const inserted = await client.query(
    "INSERT INTO bank_transaction (id, tenant_id, branch_id, gateway, reference_code, amount, " +
      "content, transfer_type, occurred_at, received_at, raw) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, 'in', $8, $8, $9) " +
      "ON CONFLICT ON CONSTRAINT bank_transaction_once_per_gateway_reference DO NOTHING",
    [
      id,
      arrival.tenantId,
      arrival.branchId,
      arrival.wallet,
      report.gatewayRef,
      report.amount,
      `${arrival.wallet} ${report.gatewayRef} ${report.gatewayTransactionId}`,
      arrival.receivedAt,
      JSON.stringify({ heardBy: arrival.heardBy, body: arrival.raw ?? null }),
    ],
  );
  if (inserted.rowCount === 0) return false;
  const intent = await pendingWalletIntent(client, arrival.wallet, report.gatewayRef, true);
  if (intent === null || intent.branchId !== arrival.branchId) return true;
  const transfer = {
    id,
    branchId: arrival.branchId,
    amount: report.amount,
    content: report.gatewayRef,
    receivedAt: arrival.receivedAt,
  };
  const after = await settleIntentWithTransfer(client, intent, transfer);
  await client.query("UPDATE payment_intent SET next_query_at = NULL WHERE id = $1", [after.id]);
  await appendChange(client, arrival.tenantId, {
    branchId: after.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: after.id,
    snapshot: paymentIntentSnapshotOf(after),
    commandId: null,
  });
  return true;
}
