import type { EntitySnapshot } from "@fnb/contracts";
import {
  type OrderChargeProfile,
  type OrderLine,
  type OrderStatus,
  type Quantity,
  type SentLineState,
  type Vnd,
  quantity,
  quantityToDecimalString,
} from "@fnb/domain";
import type { CounterOrder } from "./counter-order";
import type { PricedCounterOrder } from "./price-counter-order";
import { type TillPlace, moneyToWire } from "./till-command";

export interface TillOrderState {
  readonly status: OrderStatus;
  /** Bumped by every command the till records on the order; only server versions compare. */
  readonly version: number;
  readonly businessDate: string;
  readonly chargeProfile: OrderChargeProfile;
  readonly payments: readonly {
    readonly method: string;
    readonly amount: Vnd;
    readonly paymentIntentId?: string;
  }[];
  readonly sent: readonly SentLineState[];
  /** Whether the pre-bill printed for the order still shows it as it is; false by default. */
  readonly preBillPrinted?: boolean;
  /** Why the order was cancelled; none while it is not. */
  readonly reasonCode?: string | null;
}

const NOTHING_SENT: Quantity = quantity(0);

/** Lines as the server's order row carries them, with what the stations have of each. */
export function lineRowsOf(lines: readonly OrderLine[], sentState: readonly SentLineState[]) {
  const sent = new Map(sentState.map((line) => [line.lineId, line]));
  return lines.map((line) => ({
    id: line.id,
    parentLineId: line.parentLineId,
    lineType: line.lineType,
    productId: line.productId,
    variantId: line.variantId,
    modifierOptionId: line.modifierOptionId,
    nameSnapshot: line.nameSnapshot,
    unitPrice: moneyToWire(line.unitPrice),
    quantity: quantityToDecimalString(line.quantity),
    taxRate: line.taxRate,
    note: line.note,
    priceSource: line.priceSource,
    reversesLineId: line.reversesLineId,
    wholeParentLine: line.wholeParentLine === true,
    sentQuantity: quantityToDecimalString(sent.get(line.id)?.sentQuantity ?? NOTHING_SENT),
    sentNote: sent.get(line.id)?.sentNote ?? null,
    restock: null,
  }));
}

/**
 * What the till expects the server's copy of the order to look like after its command, in
 * the server's own shape, so the row reads the same before and after the answer comes.
 */
export function tillOrderSnapshot(
  place: TillPlace,
  order: CounterOrder,
  priced: PricedCounterOrder,
  state: TillOrderState,
): EntitySnapshot {
  return {
    id: order.orderId,
    branchId: place.branchId,
    deviceId: order.openedOn ?? place.deviceId,
    deviceOrderNo: order.deviceOrderNo,
    status: state.status,
    serviceType: order.serviceType,
    channelKey: null,
    businessDate: state.businessDate,
    version: state.version,
    refundOfOrderId: null,
    officialNo: null,
    callNumber: null,
    tableId: order.table?.id ?? null,
    tableName: order.table?.name ?? null,
    tableTag: order.tableTag,
    preBillPrinted: state.preBillPrinted ?? false,
    reasonCode: state.reasonCode ?? null,
    chargeProfile: state.chargeProfile,
    refundAmounts: null,
    lines: lineRowsOf(priced.lines, state.sent),
    payments: state.payments.map((payment) => ({
      method: payment.method,
      amount: moneyToWire(payment.amount),
      paymentIntentId: payment.paymentIntentId ?? null,
    })),
  };
}
