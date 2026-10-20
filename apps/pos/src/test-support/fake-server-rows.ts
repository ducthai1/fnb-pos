import type { SyncCommandEnvelope } from "@fnb/contracts";

type Row = Record<string, unknown> & { id: string; version: number };

/**
 * The rows the real server answers accepted commands with, kept just far enough for a
 * till to see its shift and orders come back: the fields the till reads, a version that
 * grows, the status a command leaves. Prices and totals are the server's business, not this.
 */
export function fakeServerRows(deviceId: string, branchId: string) {
  const rows = new Map<string, Row>();
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
    /** The row an accepted command answers with, or undefined for a command about no row. */
    answer(command: SyncCommandEnvelope): Row | undefined {
      const payload = command.payload as Record<string, unknown>;
      switch (command.type) {
        case "shift.open":
          return bump(String(payload.shiftId), {
            deviceId,
            status: "open",
            businessDate: command.businessDate,
          });
        case "order.save_draft":
          return bump(String(payload.orderId), {
            deviceId,
            deviceOrderNo: payload.deviceOrderNo,
            status: "draft",
            lines: payload.lines,
          });
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
