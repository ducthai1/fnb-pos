import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  type ShiftCashEvent,
  type Vnd,
  ZERO_VND,
  assessClosingCount,
  summarizeShiftCash,
  vnd,
} from "@fnb/domain";
import type { Row } from "./fake-table-rows";

type Payload = Record<string, unknown>;
const wire = (amount: Vnd) => Number(amount);

/**
 * The server's cash book of the till's shifts, kept from the commands that reach it: the
 * float, cash paid in and refunded out under the shift the till names, cash moves; the close
 * judged by the domain against it with no tolerance, as a shop that set none.
 */
export function fakeShiftBook(rows: Map<string, Row>, deviceId: string) {
  const books = new Map<string, { opening: Vnd; events: ShiftCashEvent[] }>();
  const figuresOf = (shiftId: string) => {
    const book = books.get(shiftId) ?? { opening: ZERO_VND, events: [] };
    const figures = summarizeShiftCash({ openingCash: book.opening, events: book.events });
    return {
      ledger: { openingCash: book.opening, events: book.events },
      wire: Object.fromEntries(Object.entries(figures).map(([key, amount]) => [key, wire(amount)])),
    };
  };
  const cashOf = (payload: Payload, key: "payments" | "payouts") =>
    ((payload[key] ?? []) as Payload[])
      .filter((payment) => payment.method === "cash")
      .map((payment) => vnd(Math.abs(Number(payment.amount))));

  return {
    /** Cash a payment or refund took in or out, under the shift it names. */
    note(command: SyncCommandEnvelope) {
      const payload = command.payload as Payload;
      const book = books.get(String(payload.shiftId));
      if (book === undefined) return;
      if (command.type === "order.pay") {
        for (const amount of cashOf(payload, "payments"))
          book.events.push({ kind: "cash_sale", amount });
      }
      if (command.type === "order.refund") {
        for (const amount of cashOf(payload, "payouts"))
          book.events.push({ kind: "cash_refund", amount });
      }
    },
    /** SYNC_APPROVAL_REQUIRED for a close beyond the tolerance that names no approval. */
    refusalOf(command: SyncCommandEnvelope): string | undefined {
      if (command.type !== "shift.close") return undefined;
      const payload = command.payload as Payload;
      const open = [...rows.values()].find(
        (row) => row.deviceId === deviceId && row.status === "open",
      );
      if (open === undefined) return "SYNC_NO_OPEN_SHIFT";
      const { ledger } = figuresOf(open.id);
      const assessed = assessClosingCount(ledger, vnd(Number(payload.counted)), ZERO_VND);
      return assessed.needsAcceptance && payload.approvalId === undefined
        ? "SYNC_APPROVAL_REQUIRED"
        : undefined;
    },
    answer(command: SyncCommandEnvelope, staffId: string): Row | undefined {
      const payload = command.payload as Payload;
      if (command.type === "shift.open") {
        const id = String(payload.shiftId);
        books.set(id, { opening: vnd(Number(payload.openingCash)), events: [] });
        const row: Row = {
          id,
          deviceId,
          status: "open",
          businessDate: command.businessDate,
          version: 1,
          openedByStaffId: staffId,
          openingDenominations: payload.denominations ?? [],
          figures: figuresOf(id).wire,
          close: null,
          cashRecordedAfterClose: 0,
        };
        rows.set(id, row);
        return row;
      }
      const open = [...rows.values()].find(
        (row) => row.deviceId === deviceId && row.status === "open",
      );
      if (open === undefined) return undefined;
      if (command.type === "shift.cash_move") {
        const kind = payload.kind === "in" ? "cash_in" : "cash_out";
        books.get(open.id)?.events.push({ kind, amount: vnd(Number(payload.amount)), staffId });
        const row: Row = { ...open, version: open.version + 1, figures: figuresOf(open.id).wire };
        rows.set(row.id, row);
        return row;
      }
      if (command.type === "shift.close") {
        const { ledger, wire: figures } = figuresOf(open.id);
        const assessed = assessClosingCount(ledger, vnd(Number(payload.counted)), ZERO_VND);
        const close = {
          closedByStaffId: staffId,
          countedCash: wire(assessed.countedCash),
          expectedCash: wire(assessed.expectedCash),
          difference: wire(assessed.difference),
          approvalId: payload.approvalId ?? null,
          denominations: payload.denominations,
          openOrdersCarried: 0,
        };
        const row: Row = { ...open, status: "closed", version: open.version + 1, figures, close };
        rows.set(row.id, row);
        return row;
      }
      return undefined;
    },
  };
}
