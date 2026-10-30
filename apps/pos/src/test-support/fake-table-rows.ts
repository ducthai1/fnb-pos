import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  ZERO_VND,
  quantity,
  quantityFromThousandths,
  quantityToDecimalString,
  vnd,
} from "@fnb/domain";
import type { TillMenu } from "../features/menu/till-menu";
import type { CartLine, CounterOrder } from "../features/order/counter-order";
import { entryOfStored } from "../features/order/order-opening";
import { tillOrderSnapshot } from "../features/order/order-snapshot-for-till";
import { priceCounterOrder } from "../features/order/price-counter-order";

export type Row = Record<string, unknown> & { id: string; version: number };
type Payload = Record<string, unknown>;
type LineRow = Record<string, unknown> & { id: string };

const PROFILE = { pricesIncludeTax: true, serviceCharge: null };

/**
 * The draft intents of a save as cart lines, to price them as the server would: a typed
 * price as typed, a weight (sent in the product's unit) back in grams.
 */
const cartLinesOf = (menu: TillMenu, payload: Payload): CartLine[] =>
  (payload.lines as Payload[]).map((line) => {
    const typed = typeof line.enteredPrice === "number" ? vnd(line.enteredPrice) : undefined;
    const entry = entryOfStored(menu, {
      productId: String(line.productId),
      quantity: quantity(String(line.quantity)),
      unitPrice: typed ?? ZERO_VND,
      priceSource: typed === undefined ? "base" : "manual",
    });
    return {
      lineId: String(line.lineId),
      productId: String(line.productId),
      variantId: (line.variantId as string | null) ?? null,
      modifiers: line.modifiers as CartLine["modifiers"],
      ...entry,
      note: (line.note as string | null) ?? null,
    };
  });

/**
 * Whether a ticket reports a new item the server's copy of the order does not hold, or more
 * units of it than are still unsent: the real server refuses such a ticket for good.
 */
function unownedTicketLine(payload: Payload, held: Row | undefined): boolean {
  const lines = (held?.lines ?? []) as LineRow[];
  const tickets = payload.stations as { lines: Payload[] }[];
  return tickets.some((station) =>
    station.lines.some((reported) => {
      if (reported.kind !== "new") return false;
      const line = lines.find((entry) => entry.id === reported.lineId);
      if (line === undefined) return true;
      const unsent = quantity(String(line.quantity)) - quantity(String(line.sentQuantity ?? "0"));
      return quantity(String(reported.quantity)) > unsent;
    }),
  );
}

/**
 * The order rows a table's commands leave, shaped as the real server sends them, priced
 * from the bootstrap menu (the fake has no price lists), so a till reading a row it did not
 * write itself (another till's order, its own after a restart) reads the full order.
 */
export function fakeTableRows(
  rows: Map<string, Row>,
  menu: TillMenu,
  place: { deviceId: string; branchId: string },
  tableNameOf: (tableId: string) => string,
) {
  const at = (command: SyncCommandEnvelope) => Date.parse(command.createdAt);
  const seatedAt = (tableId: unknown, except: string) =>
    [...rows.values()].find(
      (row) => row.tableId === tableId && row.status === "draft" && row.id !== except,
    );

  function saveDraft(command: SyncCommandEnvelope, payload: Payload): Row {
    const before = rows.get(String(payload.orderId));
    const tableId =
      (before?.tableId as string | null | undefined) ?? (payload.tableId as string | null);
    const order: CounterOrder = {
      orderId: String(payload.orderId),
      deviceOrderNo: (before?.deviceOrderNo as number | undefined) ?? Number(payload.deviceOrderNo),
      serviceType: payload.serviceType === "dine_in" ? "dine_in" : "takeaway",
      tableTag: (payload.tableTag as string | null | undefined) ?? null,
      table: tableId === null ? null : { id: tableId, name: tableNameOf(tableId) },
      lines: cartLinesOf(menu, payload),
    };
    const priced = priceCounterOrder(menu, order, PROFILE, at(command));
    const shaped = tillOrderSnapshot(
      { ...place, utcOffsetMinutes: 420, businessDayStartMinute: 240 },
      order,
      priced,
      {
        status: "draft",
        version: (before?.version ?? 0) + 1,
        businessDate: (before?.businessDate as string | undefined) ?? command.businessDate,
        chargeProfile: PROFILE,
        payments: [],
        sent: [],
      },
    );
    const sentBefore = new Map(((before?.lines ?? []) as LineRow[]).map((line) => [line.id, line]));
    const fresh = new Set((shaped.lines as LineRow[]).map((line) => line.id));
    // Lines only commands make stay whatever a save sends, as the server keeps them.
    const commandMade = ((before?.lines ?? []) as LineRow[]).filter(
      (line) =>
        !fresh.has(line.id) &&
        (line.lineType === "discount" || line.reversesLineId !== null || isUnderCancel(line)),
    );
    function isUnderCancel(line: LineRow) {
      const parent = ((before?.lines ?? []) as LineRow[]).find((p) => p.id === line.parentLineId);
      return parent !== undefined && parent.reversesLineId !== null;
    }
    const lines = [...(shaped.lines as LineRow[]), ...commandMade].map((line) => ({
      ...line,
      sentQuantity: sentBefore.get(line.id)?.sentQuantity ?? "0",
      sentNote: sentBefore.get(line.id)?.sentNote ?? null,
    }));
    const row: Row = {
      ...shaped,
      deviceId: (before?.deviceId as string | undefined) ?? place.deviceId,
      lines,
      openedAt: before?.openedAt ?? command.createdAt,
      id: order.orderId,
      version: (before?.version ?? 0) + 1,
    };
    rows.set(row.id, row);
    return row;
  }

  function markSent(payload: Payload, before: Row): Row {
    const units = new Map<string, { quantity: string; note: unknown }>();
    for (const station of payload.stations as { lines: Payload[] }[]) {
      for (const line of station.lines) {
        units.set(String(line.lineId), { quantity: String(line.quantity), note: line.note });
      }
    }
    const lines = (before.lines as LineRow[]).map((line) => {
      const printed = units.get(line.id);
      if (printed === undefined) return line;
      const total = quantity(String(line.sentQuantity ?? "0")) + quantity(printed.quantity);
      const sentQuantity = quantityToDecimalString(quantityFromThousandths(total));
      return { ...line, sentQuantity, sentNote: printed.note };
    });
    return { ...before, lines };
  }

  return {
    /** The code the real server refuses a table command with, when it would. */
    refusalOf(command: SyncCommandEnvelope): string | undefined {
      const payload = command.payload as Payload;
      const orderId = String(payload.orderId);
      const expected = payload.expectedVersion;
      if (command.type === "order.save_draft" && typeof expected === "number") {
        if (expected !== (rows.get(orderId)?.version ?? 0)) return "SYNC_ORDER_VERSION_STALE";
      }
      if (command.type === "order.save_draft" && payload.tableId && !rows.has(orderId)) {
        return seatedAt(payload.tableId, orderId) === undefined ? undefined : "SYNC_TABLE_OCCUPIED";
      }
      if (command.type === "order.mark_sent_to_kitchen") {
        return unownedTicketLine(payload, rows.get(orderId)) ? "SYNC_KITCHEN_NOT_OWED" : undefined;
      }
      if (command.type === "table.transfer") {
        return seatedAt(payload.toTableId, orderId) === undefined
          ? undefined
          : "SYNC_TABLE_OCCUPIED";
      }
      return undefined;
    },
    /** The row a table command leaves, or undefined for a command this does not model. */
    answer(command: SyncCommandEnvelope): Row | undefined {
      const payload = command.payload as Payload;
      const before = rows.get(String(payload.orderId));
      if (command.type === "order.save_draft" && Array.isArray(payload.lines)) {
        return saveDraft(command, payload);
      }
      if (before === undefined || !before.tableId) return undefined;
      const bump = (fields: Payload) => {
        const row: Row = { ...before, ...fields, id: before.id, version: before.version + 1 };
        rows.set(row.id, row);
        return row;
      };
      switch (command.type) {
        case "order.mark_sent_to_kitchen":
          return bump(markSent(payload, before));
        case "order.mark_pre_bill_printed":
          // A slip of an older version marks nothing: the order changed after it was printed.
          if (payload.printedVersion !== undefined && payload.printedVersion !== before.version) {
            return before;
          }
          return bump({ preBillPrinted: true });
        case "table.transfer": {
          const tableId = String(payload.toTableId);
          return bump({ tableId, tableName: tableNameOf(tableId) });
        }
        case "order.pay":
          return bump({ status: "paid", payments: payload.payments, preBillPrinted: false });
        default:
          return undefined;
      }
    },
  };
}
