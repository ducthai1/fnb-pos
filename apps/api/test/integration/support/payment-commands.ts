import { randomBytes } from "node:crypto";
import type { PaymentIntentSnapshot } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import { contentCodeFromRandom } from "@fnb/domain/payment";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { SyncChange, SyncCommandResult } from "../../../src/sync/sync-wire-types";
import {
  RECORDED_AT,
  SERVER_STARTS_AT,
  command,
  line,
  orderIdOf,
  pushOne,
  saveDraft,
} from "./sync-commands";
import type { SyncShop, Till } from "./sync-shop";

/** A code drawn the way a till draws one. */
export const freshCode = () => contentCodeFromRandom(randomBytes(8));

export { SERVER_STARTS_AT };

/** When a QR the server hears of at SERVER_STARTS_AT stops being payable. */
export const EXPIRES_AT = new Date(SERVER_STARTS_AT.getTime() + 15 * 60_000);

export function createIntent(
  till: Till,
  orderId: string,
  amount: number,
  intent: { intentId?: string; contentCode?: string; createdAt?: string } = {},
) {
  return command(
    till,
    "payment.create_intent",
    {
      intentId: intent.intentId ?? newId(),
      orderId,
      amount,
      contentCode: intent.contentCode ?? freshCode(),
    },
    intent.createdAt === undefined ? {} : { createdAt: intent.createdAt },
  );
}

export const intentIdOf = (sent: { payload: unknown }) =>
  (sent.payload as { intentId: string }).intentId;
export const contentCodeOf = (sent: { payload: unknown }) =>
  (sent.payload as { contentCode: string }).contentCode;

/** The intent a payment command answered with. */
export const intentOf = (result: SyncCommandResult) =>
  result.snapshot as PaymentIntentSnapshot | undefined;

/** order.pay with one QR transfer for the whole amount due. */
export function payByQr(till: Till, orderId: string, intentId: string, amount: number) {
  return command(till, "order.pay", {
    orderId,
    payments: [{ method: "qr_transfer", amount, paymentIntentId: intentId }],
    expectedAmountDue: amount,
  });
}

/** A draft of one coffee with an extra shot, 39.000đ, saved by `till`; returns its id. */
export async function draftOf39k(app: FastifyInstance, s: SyncShop, till: Till = s.tillA) {
  const extra = {
    groupId: s.menu.coffee.extrasGroup,
    optionId: s.menu.coffee.extraShot,
    quantity: 1,
  };
  const sent = saveDraft(till, [line(s.menu.coffee.id, { modifiers: [extra] })]);
  const result = await pushOne(app, till, sent);
  if (result.status !== "accepted") throw new Error(`draft answered ${result.code}`);
  return orderIdOf(sent);
}

/** A 39.000đ draft with a QR out for its whole amount, shown by `till`. */
export async function liveQrOf39k(app: FastifyInstance, s: SyncShop, till: Till = s.tillA) {
  const orderId = await draftOf39k(app, s, till);
  const sent = createIntent(till, orderId, 39_000);
  const result = await pushOne(app, till, sent);
  if (result.status !== "accepted") throw new Error(`the QR answered ${result.code}`);
  return { orderId, intentId: intentIdOf(sent), contentCode: contentCodeOf(sent) };
}

export interface ArrivingTransfer {
  branchId: string;
  amount: number;
  content: string;
  receivedAt?: Date;
  transferType?: "in" | "out";
}

/** A transfer recorded as a gateway would have reported it, without the webhook. */
export async function recordTransfer(pool: pg.Pool, tenantId: string, transfer: ArrivingTransfer) {
  const id = newId();
  const at = transfer.receivedAt ?? new Date(RECORDED_AT);
  await withTenant(pool, tenantId, (client) =>
    client.query(
      "INSERT INTO bank_transaction (id, tenant_id, branch_id, gateway, reference_code, amount, " +
        "content, transfer_type, occurred_at, received_at, raw) " +
        "VALUES ($1, $2, $3, 'fake', $8, $4, $5, $6, $7, $7, '{}')",
      [
        id,
        tenantId,
        transfer.branchId,
        transfer.amount,
        transfer.content,
        transfer.transferType ?? "in",
        at,
        id,
      ],
    ),
  );
  return id;
}

/** The latest copy of `intentId` among pulled changes. */
export function latestIntent(changes: readonly SyncChange[], intentId: string) {
  const copies = changes.filter((c) => c.entity === "payment_intent" && c.entityId === intentId);
  return copies.at(-1)?.snapshot as PaymentIntentSnapshot | undefined;
}
