import { appendAudit } from "@fnb/db";
import type pg from "pg";
import { einvoiceAmountsFromJson } from "./einvoice-amounts";
import { EINVOICE_FAILURE_CODES } from "./einvoice-error-codes";
import type { OutcomeContext, RecordedOutcome } from "./einvoice-outcomes";
import type { DailyBatch, ProviderFailure, SubmittedBatch } from "./einvoice-provider";
import { afterFailure } from "./einvoice-retry-policy";

/** A batch a worker took off the queue: what to send, and the attempt it counts as. */
export interface ClaimedBatch {
  readonly id: string;
  readonly provider: string;
  readonly attempts: number;
  readonly batch: DailyBatch;
}

// The oldest due batch nobody holds, or the one asked for when $3 names it.
const NEXT_DUE =
  "SELECT id FROM einvoice_daily_batch WHERE status IN ('pending', 'failed_retryable') " +
  "AND next_attempt_at <= $1 AND provider = ANY ($2) AND ($3::uuid IS NULL OR id = $3) " +
  "ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED";

// Claimed as an invoice is: the attempt counted and the row hidden behind a lease.
const CLAIM =
  "UPDATE einvoice_daily_batch SET attempts = attempts + 1, next_attempt_at = $2, " +
  "updated_at = $3, version = version + 1 WHERE id = $1 RETURNING id, branch_id, " +
  "business_date::text AS business_date, provider, regime_version, seller, attempts";

/** Claims the current tenant's next due batch, with its invoices, or null when none is due. */
export async function claimDueBatch(
  client: pg.ClientBase,
  claim: { now: Date; leaseMs: number; providers: readonly string[]; batchId?: string },
): Promise<ClaimedBatch | null> {
  const due = await client.query<{ id: string }>(NEXT_DUE, [
    claim.now,
    claim.providers,
    claim.batchId ?? null,
  ]);
  const id = due.rows[0]?.id;
  if (id === undefined) return null;
  const leaseEnd = new Date(claim.now.getTime() + claim.leaseMs);
  const { rows } = await client.query<{
    id: string;
    branch_id: string;
    business_date: string;
    provider: string;
    regime_version: string;
    seller: DailyBatch["seller"];
    attempts: number;
  }>(CLAIM, [id, leaseEnd, claim.now]);
  const row = rows[0];
  if (row === undefined) throw new Error(`claimed batch ${id} vanished`);
  const invoices = await client.query<{
    id: string;
    number: string;
    template_symbol: string;
    tax_authority_code: string | null;
    sold_at: Date;
    amounts: unknown;
  }>(
    "SELECT id, number, template_symbol, tax_authority_code, sold_at, amounts FROM einvoice " +
      "WHERE batch_id = $1 ORDER BY sold_at, id",
    [id],
  );
  return {
    id: row.id,
    provider: row.provider,
    attempts: row.attempts,
    batch: {
      id: row.id,
      branchId: row.branch_id,
      businessDate: row.business_date,
      regimeVersion: row.regime_version,
      seller: row.seller,
      invoices: invoices.rows.map((invoice) => {
        const amounts = einvoiceAmountsFromJson(invoice.amounts);
        return {
          id: invoice.id,
          number: invoice.number,
          templateSymbol: invoice.template_symbol,
          taxAuthorityCode: invoice.tax_authority_code,
          soldAt: invoice.sold_at,
          amountDue: amounts.amountDue,
          taxTotal: amounts.taxTotal,
        };
      }),
    },
  };
}

/**
 * Records what the provider answered for a claimed batch. A batch failed for good goes on
 * the audit trail: the day's data is late from then on, and the regime fines late data.
 */
export async function recordBatchOutcome(
  client: pg.ClientBase,
  context: OutcomeContext,
  claimed: ClaimedBatch,
  outcome: SubmittedBatch | ProviderFailure,
): Promise<RecordedOutcome> {
  const { rows } = await client.query<{ attempts: number; status: string }>(
    "SELECT attempts, status FROM einvoice_daily_batch WHERE id = $1 FOR UPDATE",
    [claimed.id],
  );
  const current = rows[0];
  const queued = current?.status === "pending" || current?.status === "failed_retryable";
  if (current === undefined || !queued || current.attempts !== claimed.attempts) {
    // The provider took the batch after the row moved on: the receipt is kept for the
    // person who checks the day's data went through once.
    if (outcome.ok) {
      await appendAudit(client, {
        actor: { kind: "system" },
        action: "einvoice.batch_submitted_after_lease",
        entityKind: "einvoice_daily_batch",
        entityId: claimed.id,
        payload: {
          reference: outcome.reference,
          attempt: claimed.attempts,
          rowAttempts: current?.attempts ?? null,
          rowStatus: current?.status ?? null,
        },
      });
    }
    return "stale";
  }
  if (outcome.ok) {
    await client.query(
      "UPDATE einvoice_daily_batch SET status = 'submitted', reference = $2, submitted_at = $3, " +
        "next_attempt_at = NULL, last_error_code = NULL, updated_at = $3, version = version + 1 " +
        "WHERE id = $1",
      [claimed.id, outcome.reference, context.now],
    );
    return "submitted";
  }
  const next = afterFailure(
    context.policy,
    outcome,
    claimed.attempts,
    context.now,
    EINVOICE_FAILURE_CODES.attemptsExhausted,
  );
  await client.query(
    "UPDATE einvoice_daily_batch SET status = $2, next_attempt_at = $3, last_error_code = $4, " +
      "updated_at = $5, version = version + 1 WHERE id = $1",
    [
      claimed.id,
      next.status,
      next.status === "failed_retryable" ? next.due : null,
      next.code,
      context.now,
    ],
  );
  if (next.status === "failed_retryable") return "retrying";
  await appendAudit(client, {
    actor: { kind: "system" },
    action: "einvoice.batch_failed_permanent",
    entityKind: "einvoice_daily_batch",
    entityId: claimed.id,
    payload: {
      branchId: claimed.batch.branchId,
      businessDate: claimed.batch.businessDate,
      code: next.code,
      lastProviderCode: outcome.code,
      attempts: claimed.attempts,
    },
  });
  return "failed";
}
