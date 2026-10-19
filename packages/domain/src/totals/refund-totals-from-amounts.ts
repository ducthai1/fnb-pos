import { DomainError } from "../errors";
import { type BasisPoints, type Vnd, ZERO_VND, addVnd, subtractVnd } from "../money";
import {
  type OrderLine,
  type RefundAmounts,
  type RefundLineAmounts,
  effectiveQuantity,
} from "../order";
import type { LineTotals, OrderTotals, TaxGroupTotals } from "./order-totals-types";
import { mirroredRefundLines } from "./refund-mirror";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/**
 * The totals of a refund that carries its amounts (see buildRefund): the amounts are already
 * the shares of what the sale charged, so nothing is priced or rounded again; this only adds
 * them up the way computeOrderTotals does for a sale, so a whole-order refund reads as the
 * exact negative of the sale. The branch's profile is not read: it may have changed since.
 */
export function refundTotalsFromAmounts(
  lines: readonly OrderLine[],
  refundOfOrderId: string,
  amounts: RefundAmounts,
): OrderTotals {
  mirroredRefundLines(lines, refundOfOrderId); // the lines must be a valid refund first
  const goods = lines.filter((line) => line.lineType !== "discount");
  const perLine = amountsByGoodsLine(goods, amounts.lines);
  const groups = new Map<BasisPoints, { amount: Vnd; tax: Vnd }>();
  const addToGroup = (rate: BasisPoints, amount: Vnd, tax: Vnd) => {
    const group = groups.get(rate) ?? { amount: ZERO_VND, tax: ZERO_VND };
    groups.set(rate, { amount: addVnd(group.amount, amount), tax: addVnd(group.tax, tax) });
  };
  const lineTotals: LineTotals[] = goods.map((line, i) => {
    const a = perLine[i] ?? refuse(line.id, "missing");
    const net = subtractVnd(a.gross, a.discountAllocated);
    // as on the sale, a line with no units left and nothing to give back lists no rate
    const nothing = a.gross === 0n && a.discountAllocated === 0n && a.tax === 0n;
    if (!nothing || effectiveQuantity(lines, line.id) !== 0n) addToGroup(line.taxRate, net, a.tax);
    return {
      lineId: line.id,
      gross: a.gross,
      discountAllocated: a.discountAllocated,
      net,
      tax: a.tax,
    };
  });
  const serviceCharge = addVnd(...amounts.lines.map((a) => a.serviceCharge));
  const serviceChargeTax = addVnd(...amounts.lines.map((a) => a.serviceChargeTax));
  if (serviceCharge !== 0n || serviceChargeTax !== 0n) {
    addToGroup(amounts.serviceChargeTaxRate, serviceCharge, serviceChargeTax);
  }
  const taxBreakdown: TaxGroupTotals[] = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([rate, g]) => ({
      rate,
      base: amounts.pricesIncludeTax ? subtractVnd(g.amount, g.tax) : g.amount,
      tax: g.tax,
    }));
  const grossTotal = addVnd(...lineTotals.map((l) => l.gross));
  const discountTotal = addVnd(...lineTotals.map((l) => l.discountAllocated));
  const netTotal = subtractVnd(grossTotal, discountTotal);
  const taxTotal = addVnd(...taxBreakdown.map((g) => g.tax));
  return {
    lines: lineTotals,
    grossTotal,
    discountTotal,
    netTotal,
    serviceCharge,
    serviceChargeTax,
    taxBreakdown,
    taxTotal,
    amountDue: addVnd(netTotal, serviceCharge, amounts.pricesIncludeTax ? ZERO_VND : taxTotal),
  };
}

/**
 * One entry per goods line, in their order, and nothing else; every part zero or negative: amounts that do not
 * match the lines were edited or belong to another refund, and adding them up would print a
 * refund that pays out something other than what its lines say.
 */
function amountsByGoodsLine(
  goods: readonly OrderLine[],
  entries: readonly RefundLineAmounts[],
): RefundLineAmounts[] {
  const goodsIds = new Set(goods.map((line) => line.id));
  const byLineId = new Map<string, RefundLineAmounts>();
  for (const entry of entries) {
    if (!goodsIds.has(entry.lineId) || byLineId.has(entry.lineId))
      refuse(entry.lineId, "unknown_line");
    const parts = [entry.gross, entry.tax, entry.serviceCharge, entry.serviceChargeTax];
    const net = subtractVnd(entry.gross, entry.discountAllocated);
    if (parts.some((part) => part > 0n) || entry.discountAllocated > 0n || net > 0n) {
      refuse(entry.lineId, "positive");
    }
    byLineId.set(entry.lineId, entry);
  }
  return goods.map((line) => byLineId.get(line.id) ?? refuse(line.id, "missing"));
}

function refuse(lineId: string, reason: "unknown_line" | "positive" | "missing"): never {
  throw new DomainError(
    TOTALS_ERROR_CODES.invalidRefundAmounts,
    `the refund amounts do not match refund line ${lineId}: ${reason}`,
    { lineId, reason },
  );
}
