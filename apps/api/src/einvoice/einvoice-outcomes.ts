import { appendAudit } from "@fnb/db";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";
import { orderSnapshotOf } from "../sync/order-snapshot";
import { readStoredOrder } from "../sync/stored-order";
import type { ClaimedInvoice } from "./einvoice-claims";
import { EINVOICE_FAILURE_CODES } from "./einvoice-error-codes";
import type { IssuedInvoice, ProviderFailure } from "./einvoice-provider";
import { type EInvoiceRetryPolicy, afterFailure } from "./einvoice-retry-policy";

export type IssueOutcome = IssuedInvoice | ProviderFailure;

/**
 * What became of one claimed invoice or batch; "stale" when another worker had claimed it
 * since (its lease ran out), so this answer is not the one recorded.
 */
export type RecordedOutcome = "issued" | "submitted" | "retrying" | "failed" | "stale";

export interface OutcomeContext {
  readonly tenantId: string;
  readonly now: Date;
  readonly policy: EInvoiceRetryPolicy;
}

/**
 * Records what the provider answered for a claimed invoice. An issued invoice, and one
 * failed for good, change what the order's tills should show (the lookup code for a
 * reprint, or that the invoice needs a person), so the order goes out on the feed again
 * with a new version. A permanent failure is also put on the audit trail, where the
 * backoffice finds what needs attention.
 */
export async function recordIssueOutcome(
  client: pg.ClientBase,
  context: OutcomeContext,
  claimed: ClaimedInvoice,
  outcome: IssueOutcome,
): Promise<RecordedOutcome> {
  await lockTenantChangeFeed(client, context.tenantId);
  const { rows } = await client.query<{ attempts: number; status: string }>(
    "SELECT attempts, status FROM einvoice WHERE id = $1 FOR UPDATE",
    [claimed.id],
  );
  const current = rows[0];
  const queued = current?.status === "pending" || current?.status === "failed_retryable";
  if (current === undefined || !queued || current.attempts !== claimed.attempts) {
    if (outcome.ok) await keepLateIssue(client, claimed, outcome, current);
    return "stale";
  }
  if (outcome.ok) {
    await client.query(
      "UPDATE einvoice SET status = 'issued', number = $2, tax_authority_code = $3, " +
        "lookup_code = $4, lookup_url = $5, issued_at = $6, next_attempt_at = NULL, " +
        "last_error_code = NULL, updated_at = $6, version = version + 1 WHERE id = $1",
      [
        claimed.id,
        outcome.number,
        outcome.taxAuthorityCode,
        outcome.lookupCode,
        outcome.lookupUrl,
        context.now,
      ],
    );
    await announceToTills(client, context.tenantId, claimed.orderId);
    return "issued";
  }
  const next = afterFailure(
    context.policy,
    outcome,
    claimed.attempts,
    context.now,
    EINVOICE_FAILURE_CODES.attemptsExhausted,
  );
  if (next.status === "failed_retryable") {
    await client.query(
      "UPDATE einvoice SET status = 'failed_retryable', next_attempt_at = $2, " +
        "last_error_code = $3, updated_at = $4, version = version + 1 WHERE id = $1",
      [claimed.id, next.due, next.code, context.now],
    );
    return "retrying";
  }
  const { code } = next;
  await client.query(
    "UPDATE einvoice SET status = 'failed_permanent', next_attempt_at = NULL, " +
      "last_error_code = $2, updated_at = $3, version = version + 1 WHERE id = $1",
    [claimed.id, code, context.now],
  );
  await appendAudit(client, {
    actor: { kind: "system" },
    action: "einvoice.failed_permanent",
    entityKind: "einvoice",
    entityId: claimed.id,
    payload: {
      orderId: claimed.orderId,
      code,
      lastProviderCode: outcome.code,
      attempts: claimed.attempts,
    },
  });
  await announceToTills(client, context.tenantId, claimed.orderId);
  return "failed";
}

/**
 * An invoice the provider issued after the row had moved on (its lease ran out and another
 * attempt holds it, or that attempt has recorded already): the row is the later attempt's,
 * but the number is a real invoice at the provider, so it goes on the audit trail for the
 * person who checks the two agree, never dropped.
 */
async function keepLateIssue(
  client: pg.ClientBase,
  claimed: ClaimedInvoice,
  late: IssuedInvoice,
  current: { attempts: number; status: string } | undefined,
) {
  await appendAudit(client, {
    actor: { kind: "system" },
    action: "einvoice.issued_after_lease",
    entityKind: "einvoice",
    entityId: claimed.id,
    payload: {
      orderId: claimed.orderId,
      number: late.number,
      taxAuthorityCode: late.taxAuthorityCode,
      lookupCode: late.lookupCode,
      attempt: claimed.attempts,
      rowAttempts: current?.attempts ?? null,
      rowStatus: current?.status ?? null,
    },
  });
}

/**
 * Sends the order out again. A till only takes a copy whose version is newer, so a paid
 * order's version moves; a posted order is locked for good and keeps its version, and its
 * tills see the invoice on their next full bootstrap.
 */
async function announceToTills(client: pg.ClientBase, tenantId: string, orderId: string) {
  await client.query(
    "UPDATE sales_order SET version = version + 1, updated_at = now() " +
      "WHERE id = $1 AND status = 'paid'",
    [orderId],
  );
  const stored = await readStoredOrder(client, orderId, false);
  if (stored === null) return;
  await appendChange(client, tenantId, {
    branchId: stored.branchId,
    entity: "order",
    entityId: orderId,
    snapshot: orderSnapshotOf(stored),
    commandId: null,
  });
}
