import type { EInvoiceProfile } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type pg from "pg";
import type { StoredOrder } from "../sync/stored-order";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "../sync/sync-error-codes";
import { enabledProfile, readBranchEInvoiceProfile } from "./branch-einvoice-profile";
import { einvoiceAmountsOf, einvoiceAmountsToJson } from "./einvoice-amounts";

/**
 * The till's branch's profile when it invoices now, else null. A stored profile the server
 * cannot read refuses the command, as any unreadable setting does: guessing a seller would
 * issue invoices in a name nobody chose, and skipping would leave a sale uninvoiced.
 */
export async function invoicingProfileOf(context: SyncCommandContext) {
  const found = await readBranchEInvoiceProfile(context.client, context.device.branchId);
  if (found?.status === "unreadable") throw new CommandRejection(SYNC_ERROR_CODES.settingInvalid);
  return enabledProfile(found);
}

interface QueuedInvoice {
  readonly order: Pick<StoredOrder, "order" | "chargeProfile">;
  readonly profile: EInvoiceProfile;
  readonly buyer: unknown;
  readonly adjustsEInvoiceId: string | null;
}

/**
 * Queues the invoice of an order the command just closed, in the command's transaction: the
 * payment and its invoice commit together or not at all. It is dated when the till took the
 * money and due at once; the worker issues it.
 */
async function queueInvoice(context: SyncCommandContext, queued: QueuedInvoice) {
  const { client, device, command, staffId, receivedAt } = context;
  const { order, profile } = queued;
  const seller = {
    taxCode: profile.sellerTaxCode,
    name: profile.sellerName,
    address: profile.sellerAddress,
  };
  await client.query(
    "INSERT INTO einvoice (id, tenant_id, order_id, branch_id, business_date, kind, " +
      "adjusts_einvoice_id, next_attempt_at, provider, regime_version, template_symbol, seller, " +
      "buyer, sold_at, amounts, created_by) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    [
      newId(),
      device.tenantId,
      order.order.id,
      device.branchId,
      order.order.businessDate,
      queued.adjustsEInvoiceId === null ? "sale" : "adjustment",
      queued.adjustsEInvoiceId,
      receivedAt,
      profile.provider,
      profile.regimeVersion,
      profile.templateSymbol,
      JSON.stringify(seller),
      queued.buyer === null ? null : JSON.stringify(queued.buyer),
      command.createdAt,
      JSON.stringify(einvoiceAmountsToJson(einvoiceAmountsOf(order))),
      staffId,
    ],
  );
}

/** order.pay: the sale's invoice, with what the customer asked for while it was a draft. */
export async function queueSaleInvoice(context: SyncCommandContext, sale: StoredOrder) {
  const profile = await invoicingProfileOf(context);
  if (profile === null) return;
  const { rows } = await context.client.query<{ einvoice_buyer: unknown }>(
    "SELECT einvoice_buyer FROM sales_order WHERE id = $1",
    [sale.order.id],
  );
  const buyer = rows[0]?.einvoice_buyer ?? null;
  await queueInvoice(context, { order: sale, profile, buyer, adjustsEInvoiceId: null });
}

/**
 * order.refund: an invoice adjusting the sale's, only when the branch's profile asks for
 * one (by default a refund is booked without an invoice: how the law treats it is still
 * an open question for the accountant) and the sale was invoiced at all.
 */
export async function queueRefundInvoice(
  context: SyncCommandContext,
  saleId: string,
  refund: Pick<StoredOrder, "order" | "chargeProfile">,
) {
  const profile = await invoicingProfileOf(context);
  if (profile === null || profile.refundInvoicing !== "adjustment") return;
  const sold = await saleInvoiceOf(context.client, saleId);
  if (sold === null) return;
  await queueInvoice(context, {
    order: refund,
    profile,
    buyer: sold.buyer,
    adjustsEInvoiceId: sold.id,
  });
}

async function saleInvoiceOf(client: pg.ClientBase, orderId: string) {
  const { rows } = await client.query<{ id: string; buyer: unknown }>(
    "SELECT id, buyer FROM einvoice WHERE order_id = $1",
    [orderId],
  );
  return rows[0] ?? null;
}
