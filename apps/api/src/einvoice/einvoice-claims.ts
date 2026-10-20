import { type EInvoiceBuyer, einvoiceBuyerSchema } from "@fnb/contracts";
import type pg from "pg";
import { einvoiceAmountsFromJson } from "./einvoice-amounts";
import type { EInvoiceDocument } from "./einvoice-provider";

/** An invoice a worker took off the queue: what to send, and the attempt it counts as. */
export interface ClaimedInvoice {
  readonly id: string;
  readonly orderId: string;
  readonly branchId: string;
  readonly provider: string;
  /** Including this attempt; the outcome is recorded only if no one claimed it since. */
  readonly attempts: number;
  readonly document: EInvoiceDocument;
}

interface ClaimedRow {
  id: string;
  order_id: string;
  branch_id: string;
  business_date: string;
  kind: "sale" | "adjustment";
  attempts: number;
  provider: string;
  regime_version: string;
  template_symbol: string;
  seller: { taxCode: string; name: string; address: string };
  buyer: unknown;
  sold_at: Date;
  amounts: unknown;
  adjusts_einvoice_id: string | null;
}

// The oldest due invoice nobody holds, of a provider the worker can reach. An adjustment
// waits for the invoice it adjusts to be out, since it has to name that invoice's number.
const NEXT_DUE =
  "SELECT e.id FROM einvoice e WHERE e.status IN ('pending', 'failed_retryable') " +
  "AND e.next_attempt_at <= $1 AND e.provider = ANY ($2) " +
  "AND (e.kind = 'sale' OR EXISTS (SELECT 1 FROM einvoice t " +
  "WHERE t.tenant_id = e.tenant_id AND t.id = e.adjusts_einvoice_id AND t.status = 'issued')) " +
  "ORDER BY e.next_attempt_at, e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED";

// Counting the attempt and pushing the due time past the lease is the claim: it commits
// before the provider is called, so a second worker skips the row, and a worker that dies
// mid-call leaves a row that comes due again when the lease ends.
const CLAIM =
  "UPDATE einvoice SET attempts = attempts + 1, next_attempt_at = $2, updated_at = $3, " +
  "version = version + 1 WHERE id = $1 RETURNING id, order_id, branch_id, " +
  "business_date::text AS business_date, kind, adjusts_einvoice_id, attempts, provider, " +
  "regime_version, template_symbol, seller, buyer, sold_at, amounts";

/** Claims the next due invoice of the current tenant, or answers null when none is due. */
export async function claimDueInvoice(
  client: pg.ClientBase,
  claim: { now: Date; leaseMs: number; providers: readonly string[] },
): Promise<ClaimedInvoice | null> {
  const { now, leaseMs } = claim;
  const due = await client.query<{ id: string }>(NEXT_DUE, [now, claim.providers]);
  const id = due.rows[0]?.id;
  if (id === undefined) return null;
  const leaseEnd = new Date(now.getTime() + leaseMs);
  const { rows } = await client.query<ClaimedRow>(CLAIM, [id, leaseEnd, now]);
  const row = rows[0];
  if (row === undefined) throw new Error(`claimed invoice ${id} vanished`);
  return {
    id: row.id,
    orderId: row.order_id,
    branchId: row.branch_id,
    provider: row.provider,
    attempts: row.attempts,
    document: {
      id: row.id,
      kind: row.kind,
      adjusts: await adjustedInvoiceOf(client, row.adjusts_einvoice_id),
      regimeVersion: row.regime_version,
      seller: { ...row.seller, templateSymbol: row.template_symbol },
      buyer: row.buyer === null ? null : (einvoiceBuyerSchema.parse(row.buyer) as EInvoiceBuyer),
      soldAt: row.sold_at,
      businessDate: row.business_date,
      amounts: einvoiceAmountsFromJson(row.amounts),
    },
  };
}

async function adjustedInvoiceOf(client: pg.ClientBase, id: string | null) {
  if (id === null) return null;
  const { rows } = await client.query<{ number: string; template_symbol: string }>(
    "SELECT number, template_symbol FROM einvoice WHERE id = $1 AND status = 'issued'",
    [id],
  );
  const target = rows[0];
  if (target === undefined) throw new Error(`adjusted invoice ${id} is not issued`);
  return { number: target.number, templateSymbol: target.template_symbol };
}
