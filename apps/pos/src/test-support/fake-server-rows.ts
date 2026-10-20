import type { SyncCommandEnvelope } from "@fnb/contracts";
import type { TillMenu } from "../features/menu/till-menu";
import { fakeOrderCommandAnswer } from "./fake-order-commands";
import { fakeRefundAnswer } from "./fake-refund-answer";
import { fakeShiftBook } from "./fake-shift-book";
import { type Row, fakeTableRows } from "./fake-table-rows";

/**
 * The rows the real server answers accepted commands with, kept just far enough for a
 * till to see its shift and orders come back: the fields the till reads, a version that
 * grows, the status a command leaves. Prices and totals are the server's business, not this.
 */
export function fakeServerRows(
  deviceId: string,
  branchId: string,
  menu: TillMenu,
  tableNameOf: (tableId: string) => string,
) {
  const rows = new Map<string, Row>();
  const tables = fakeTableRows(rows, menu, { deviceId, branchId }, tableNameOf);
  const shifts = fakeShiftBook(rows, deviceId);
  /** How long a QR stays payable from the till's command, as the server would decide it. */
  const qr = { lifetimeMs: 15 * 60_000 };
  const bump = (id: string, fields: Record<string, unknown>): Row => {
    const before = rows.get(id);
    const row: Row = { ...before, ...fields, id, version: (before?.version ?? 0) + 1 };
    rows.set(id, row);
    return row;
  };
  return {
    rows,
    qr,
    refusalOf: (command: SyncCommandEnvelope) =>
      tables.refusalOf(command) ?? shifts.refusalOf(command),
    /** The row an accepted command answers with, or undefined for a command about no row. */
    answer(command: SyncCommandEnvelope, staffId = "staff"): Row | undefined {
      const payload = command.payload as Record<string, unknown>;
      shifts.note(command);
      const shift = shifts.answer(command, staffId);
      if (shift !== undefined) return shift;
      const atTable = tables.answer(command);
      if (atTable !== undefined) return atTable;
      const adjusted = fakeOrderCommandAnswer(rows, command) ?? fakeRefundAnswer(rows, command);
      if (adjusted !== undefined) return adjusted;
      switch (command.type) {
        case "order.save_draft":
          // A bare draft a test recorded itself, with no cart to price.
          return bump(String(payload.orderId), { deviceId, status: "draft" });
        case "order.pay":
          return bump(String(payload.orderId), { status: "paid", payments: payload.payments });
        case "order.mark_sent_to_kitchen":
          return bump(String(payload.orderId), {});
        case "order.set_buyer_info":
          // The buyer stays on the server: the order answers as it was.
          return rows.get(String(payload.orderId));
        case "payment.create_intent":
          return bump(String(payload.intentId), {
            orderId: payload.orderId,
            branchId,
            amount: payload.amount,
            contentCode: payload.contentCode,
            status: "pending",
            expiresAt: new Date(Date.parse(command.createdAt) + qr.lifetimeMs).toISOString(),
            receivedAmount: null,
          });
        case "payment.cancel_intent":
          return bump(String(payload.intentId), { status: "cancelled" });
        default:
          return undefined;
      }
    },
  };
}
