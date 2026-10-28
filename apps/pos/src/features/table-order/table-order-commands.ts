import { markPreBillPrintedPayloadSchema, transferTablePayloadSchema } from "@fnb/contracts";
import type { LocalCommand } from "@fnb/sync-client";
import type { SeatedTable } from "../order/counter-order";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { type TillPlace, tillCommand } from "../order/till-command";
import type { SettledTableOrder } from "./table-order-state";

/** The row a command leaves: the order as settled, one version on, with what it changes. */
function expectedRow(
  place: TillPlace,
  settled: SettledTableOrder,
  change: { readonly table?: SeatedTable; readonly preBillPrinted?: boolean },
) {
  const order =
    change.table === undefined ? settled.order : { ...settled.order, table: change.table };
  return tillOrderSnapshot(place, order, settled.priced, {
    ...settled.state,
    version: settled.state.version + 1,
    sent: settled.sent ?? [],
    preBillPrinted: change.preBillPrinted ?? settled.state.preBillPrinted ?? false,
  });
}

/**
 * order.mark_pre_bill_printed for the version the slip shows: the table now waits to pay,
 * until its order changes again (here or on another till).
 */
export function preBillPrintedCommand(
  place: TillPlace,
  settled: SettledTableOrder,
  at: number,
): LocalCommand {
  const orderId = settled.order.orderId;
  return tillCommand(
    place,
    "order.mark_pre_bill_printed",
    markPreBillPrintedPayloadSchema,
    { orderId, printedVersion: settled.state.version },
    at,
    {
      entity: "order",
      entityId: orderId,
      optimistic: expectedRow(place, settled, { preBillPrinted: true }),
    },
  );
}

/**
 * table.transfer to a free table. Moving changes no amount, so a current pre-bill stays
 * current; what the kitchen has goes with the guests and is not printed again. A manager's
 * approval, when the staff member may not move guests alone, is for this order.
 */
export function transferTableCommand(
  place: TillPlace,
  settled: SettledTableOrder,
  to: SeatedTable,
  at: number,
  approvalId: string | null = null,
): LocalCommand {
  const orderId = settled.order.orderId;
  return tillCommand(
    place,
    "table.transfer",
    transferTablePayloadSchema,
    { orderId, toTableId: to.id, ...(approvalId === null ? {} : { approvalId }) },
    at,
    { entity: "order", entityId: orderId, optimistic: expectedRow(place, settled, { table: to }) },
  );
}
