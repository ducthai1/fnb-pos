import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  type OrderLine,
  basisPoints,
  buildLineDiscount,
  buildOrderDiscountLines,
  quantity,
  voidLine,
  vnd,
} from "@fnb/domain";
import { newId } from "../features/ids/new-id";
import { lineRowsOf } from "../features/order/order-snapshot-for-till";
import { domainOrderOf, readStoredOrder } from "../features/order/stored-order";
import type { Row } from "./fake-table-rows";

type Payload = Record<string, unknown>;
type WireDiscount = { kind: string; rate?: number; amount?: number };

const discountOf = (wire: WireDiscount) =>
  wire.kind === "percent"
    ? ({ kind: "percent", rate: basisPoints(wire.rate ?? 0) } as const)
    : ({ kind: wire.kind, amount: vnd(wire.amount ?? 0) } as never);

/**
 * The order commands a void, a discount or a cancel sends, answered as the real server does:
 * the domain's own builders on the row it holds (the server makes its own cancel line ids,
 * so do these). Approvals are not checked here: the till's payload is what tests read.
 */
export function fakeOrderCommandAnswer(
  rows: Map<string, Row>,
  command: SyncCommandEnvelope,
): Row | undefined {
  const payload = command.payload as Payload;
  const before = rows.get(String(payload.orderId));
  const stored = before === undefined ? null : readStoredOrder(before);
  if (before === undefined || stored === null) return undefined;
  const order = domainOrderOf(stored);
  const save = (lines: readonly OrderLine[], fields: Payload = {}) => {
    const row: Row = {
      ...before,
      ...fields,
      lines: lineRowsOf(lines, stored.sent),
      id: before.id,
      version: before.version + 1,
    };
    rows.set(row.id, row);
    return row;
  };
  switch (command.type) {
    case "order.void_line": {
      const sent = stored.sent.find((line) => line.lineId === payload.lineId)?.sentQuantity;
      const { order: after } = voidLine(order, {
        lineId: String(payload.lineId),
        quantity: quantity(String(payload.quantity)),
        reasonCode: String(payload.reasonCode),
        staffId: "server",
        approvedByStaffId: payload.approvalId === undefined ? null : "approver",
        sentQuantity: sent ?? quantity(0),
        newLineId: newId,
        requireApprovalAfterSent: false,
      });
      return save(after.lines);
    }
    case "order.apply_discount": {
      const ids = [...(payload.discountLineIds as string[])];
      const next = () => ids.shift() ?? newId();
      const discount = discountOf(payload.discount as WireDiscount);
      const lines =
        payload.scope === "order"
          ? buildOrderDiscountLines(order, discount, next)
          : buildLineDiscount(order, String(payload.lineId), discount, next);
      return save([...order.lines, ...lines]);
    }
    case "order.remove_discount": {
      const removed = new Set(payload.discountLineIds as string[]);
      return save(order.lines.filter((line) => !removed.has(line.id)));
    }
    case "order.cancel":
      return save(order.lines, { status: "cancelled", reasonCode: payload.reasonCode });
    default:
      return undefined;
  }
}
