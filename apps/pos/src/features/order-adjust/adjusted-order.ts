import { type Order, type OrderLine, computeOrderTotals } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { commandMadeLines } from "../order/command-made-lines";
import type { CounterOrder } from "../order/counter-order";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import type { AdjustableOrder, Adjusted } from "../order/order-session-types";
import type { KeptLines, PricedCounterOrder } from "../order/price-counter-order";
import { type TillPlace, tillCommand } from "../order/till-command";

/** The order as last saved, as the domain's draft, for its builders. */
export function draftOrderOf(settled: AdjustableOrder): Order {
  return {
    id: settled.order.orderId,
    status: "draft",
    serviceType: settled.order.serviceType,
    channelKey: null,
    businessDate: settled.state.businessDate,
    lines: settled.priced.lines,
    refundOfOrderId: null,
    refundAmounts: null,
    version: settled.state.version,
  };
}

/** Lines a command left, ordered as the till prices them: the cart's, then command-made ones. */
export function pricedAfter(
  settled: AdjustableOrder,
  lines: readonly OrderLine[],
): { priced: PricedCounterOrder; commandLines: OrderLine[] } {
  const commandLines = commandMadeLines(lines);
  const made = new Set(commandLines.map((line) => line.id));
  const ordered = [...lines.filter((line) => !made.has(line.id)), ...commandLines];
  const totals = computeOrderTotals(
    { lines: ordered, serviceType: settled.order.serviceType },
    settled.state.chargeProfile,
  );
  return { priced: { lines: ordered, totals }, commandLines };
}

/**
 * A command on the order and what it leaves: the till's expected row is the order one
 * version on, so the screen reads the same before and after the server answers.
 */
export function adjustedWith(
  place: TillPlace,
  settled: AdjustableOrder,
  change: { order: CounterOrder; kept: KeptLines; lines: readonly OrderLine[] },
  command: { type: string; contract: Parameters<typeof tillCommand>[2]; payload: object },
  at: number,
): Adjusted {
  const { priced, commandLines } = pricedAfter(settled, change.lines);
  const state = { ...settled.state, version: settled.state.version + 1, sent: settled.sent };
  const local: LocalCommand = tillCommand(
    place,
    command.type,
    command.contract,
    { ...command.payload },
    at,
    {
      entity: "order",
      entityId: settled.order.orderId,
      optimistic: tillOrderSnapshot(place, change.order, priced, state),
    },
  );
  return { order: change.order, kept: change.kept, commandLines, priced, command: local };
}
