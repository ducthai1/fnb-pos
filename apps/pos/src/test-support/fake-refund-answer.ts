import type { SyncCommandEnvelope } from "@fnb/contracts";
import { buildRefund, quantity } from "@fnb/domain";
import { newId } from "../features/ids/new-id";
import { lineRowsOf } from "../features/order/order-snapshot-for-till";
import { domainOrderOf, readStoredOrder } from "../features/order/stored-order";
import type { Row } from "./fake-table-rows";

type Payload = Record<string, unknown>;
const wire = (amount: bigint) => Number(amount);

/**
 * order.refund answered as the server does: the domain's buildRefund on the sale and the
 * refunds it holds of it, the refund's own row paid at once with the till's payouts.
 */
export function fakeRefundAnswer(rows: Map<string, Row>, command: SyncCommandEnvelope) {
  if (command.type !== "order.refund") return undefined;
  const payload = command.payload as Payload;
  const saleRow = rows.get(String(payload.saleOrderId));
  const sale = saleRow === undefined ? null : readStoredOrder(saleRow);
  if (saleRow === undefined || sale === null) return undefined;
  const earlier = [...rows.values()].flatMap((row) => {
    const order = row.refundOfOrderId === sale.orderId ? readStoredOrder(row) : null;
    return order === null ? [] : [domainOrderOf(order)];
  });
  const lines = (payload.lines as Payload[]).map((line) => ({
    lineId: String(line.lineId),
    quantity: quantity(String(line.quantity)),
    restock: line.restock === true,
  }));
  const id = String(payload.refundOrderId);
  const built = buildRefund(
    domainOrderOf(sale),
    lines,
    earlier,
    { orderId: id, newLineId: newId },
    command.businessDate,
    sale.chargeProfile,
  );
  const amounts = built.order.refundAmounts;
  const row: Row = {
    ...saleRow,
    id,
    deviceOrderNo: payload.deviceOrderNo,
    status: "paid",
    version: 1,
    refundOfOrderId: sale.orderId,
    reasonCode: payload.reasonCode,
    tableId: null,
    tableName: null,
    lines: lineRowsOf(built.order.lines, []),
    payments: (payload.payouts as Payload[]).map((payout) => ({
      ...payout,
      paymentIntentId: null,
    })),
    refundAmounts:
      amounts === null
        ? null
        : {
            ...amounts,
            lines: amounts.lines.map((line) => ({
              ...line,
              gross: wire(line.gross),
              discountAllocated: wire(line.discountAllocated),
              tax: wire(line.tax),
              serviceCharge: wire(line.serviceCharge),
              serviceChargeTax: wire(line.serviceChargeTax),
            })),
          },
  };
  rows.set(id, row);
  return row;
}
