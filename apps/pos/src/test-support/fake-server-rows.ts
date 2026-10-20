import type { SyncCommandEnvelope } from "@fnb/contracts";

type Row = Record<string, unknown> & { id: string; version: number };

/**
 * The rows the real server answers accepted commands with, kept just far enough for a
 * till to see its shift and orders come back: the fields the till reads, a version that
 * grows, the status a command leaves. Prices and totals are the server's business, not this.
 */
export function fakeServerRows(deviceId: string) {
  const rows = new Map<string, Row>();
  const bump = (id: string, fields: Record<string, unknown>): Row => {
    const before = rows.get(id);
    const row: Row = { ...before, ...fields, id, version: (before?.version ?? 0) + 1 };
    rows.set(id, row);
    return row;
  };
  return {
    rows,
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
        default:
          return undefined;
      }
    },
  };
}
