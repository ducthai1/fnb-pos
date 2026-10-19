import { newId, withTenant } from "@fnb/db";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import type pg from "pg";
import { justNow } from "./sync-approvals";
import { command } from "./sync-commands";
import type { Till } from "./sync-shop";

/**
 * A command relying on a manager's approval, dated now: approvals are timed by the
 * database clock, and one is good only close to when the till recorded the command.
 */
export function withApproval(sent: SyncCommandEnvelope, approvalId: string): SyncCommandEnvelope {
  return { ...sent, createdAt: justNow(), payload: { ...(sent.payload as object), approvalId } };
}

export const voidUnits = (
  till: Till,
  orderId: string,
  lineId: string,
  quantity: string,
  reasonCode = "customer_changed_mind",
) => command(till, "order.void_line", { orderId, lineId, quantity, reasonCode });

type Discount =
  | {
      scope: "order";
      discount: { kind: "percent"; rate: number } | { kind: "fixed"; amount: number };
    }
  | {
      scope: "line";
      lineId: string;
      discount: { kind: "percent"; rate: number } | { kind: "fixed_for_line"; amount: number };
    };

/** A discount with fresh ids for its lines, `ids` of them (one per tax rate it reduces). */
export const discount = (till: Till, orderId: string, given: Discount, ids = 1) =>
  command(till, "order.apply_discount", {
    orderId,
    discountLineIds: Array.from({ length: ids }, () => newId()),
    ...given,
  });

export const percentOffLine = (till: Till, orderId: string, lineId: string, rate: number) =>
  discount(till, orderId, { scope: "line", lineId, discount: { kind: "percent", rate } });

export const removeDiscount = (till: Till, orderId: string, discountLineIds: string[]) =>
  command(till, "order.remove_discount", { orderId, discountLineIds });

export const cancel = (till: Till, orderId: string, reasonCode = "customer_left") =>
  command(till, "order.cancel", { orderId, reasonCode });

/** What the kitchen layer will record when a ticket goes out: units of the line sent. */
export const markSent = (pool: pg.Pool, tenantId: string, lineId: string, quantity: string) =>
  withTenant(pool, tenantId, (client) =>
    client.query("UPDATE sales_order_line SET sent_quantity = $2 WHERE id = $1", [
      lineId,
      quantity,
    ]),
  );

/** A refund of `lines` of a sale, paid out in cash as `paidOut` (negative), numbered by the till. */
export const refund = (
  till: Till,
  saleOrderId: string,
  lines: { lineId: string; quantity: string; restock: boolean }[],
  paidOut: number,
) =>
  command(till, "order.refund", {
    refundOrderId: newId(),
    saleOrderId,
    deviceOrderNo: till.nextOrderNo++,
    lines,
    reasonCode: "wrong_drink",
    payouts: [{ method: "cash", amount: paidOut }],
  });
