import { type Vnd, ZERO_VND, addVnd, applyRate, subtractVnd } from "../money";
import type { ServiceType } from "../order";
import { goodsLineAmounts } from "./goods-line-amounts";
import type {
  LineTotals,
  OrderChargeProfile,
  OrderTotals,
  OrderTotalsInput,
  ServiceChargeRule,
} from "./order-totals-types";
import { type TaxableAmount, taxByRateGroup } from "./tax-by-rate-group";

/**
 * The totals of the lines of an ordinary order (voids included, see goodsLineAmounts). Nothing
 * here depends on line order beyond tie-breaking which line receives a rounding đồng.
 * Tax rates come from the lines (chosen when the item was added); totals never pick a rate.
 */
export function pricedOrderTotals(
  order: Pick<OrderTotalsInput, "lines" | "serviceType">,
  profile: OrderChargeProfile,
): OrderTotals {
  const goods = goodsLineAmounts(order.lines);
  const grossTotal = addVnd(...goods.map((g) => g.gross));
  const discountTotal = addVnd(...goods.map((g) => g.discount));
  const netTotal = subtractVnd(grossTotal, discountTotal);
  const serviceCharge = serviceChargeFor(
    profile.serviceCharge,
    order.serviceType,
    grossTotal,
    netTotal,
  );

  const taxed = goods.filter((g) => g.priced);
  const taxable: TaxableAmount[] = taxed.map((g) => ({
    rate: g.taxRate,
    amount: subtractVnd(g.gross, g.discount),
  }));
  // Listed last, so the goods keep the same tie-break whether or not a service charge applies.
  if (profile.serviceCharge && serviceCharge > 0n) {
    taxable.push({ rate: profile.serviceCharge.taxRate, amount: serviceCharge });
  }
  const { breakdown, shares } = taxByRateGroup(taxable, profile.pricesIncludeTax);
  const taxTotal = addVnd(...breakdown.map((group) => group.tax));
  const taxByLineId = new Map(taxed.map((g, i) => [g.lineId, shares[i] ?? ZERO_VND]));

  const lines: LineTotals[] = goods.map((g) => ({
    lineId: g.lineId,
    gross: g.gross,
    discountAllocated: g.discount,
    net: subtractVnd(g.gross, g.discount),
    tax: taxByLineId.get(g.lineId) ?? ZERO_VND,
  }));
  return {
    lines,
    grossTotal,
    discountTotal,
    netTotal,
    serviceCharge,
    // the service charge is the one taxable amount after the goods, when it is there at all
    serviceChargeTax: shares[taxed.length] ?? ZERO_VND,
    taxBreakdown: breakdown,
    taxTotal,
    amountDue: addVnd(netTotal, serviceCharge, profile.pricesIncludeTax ? ZERO_VND : taxTotal),
  };
}

function serviceChargeFor(
  rule: ServiceChargeRule | null,
  serviceType: ServiceType,
  grossTotal: Vnd,
  netTotal: Vnd,
): Vnd {
  if (!rule || !rule.appliesTo.includes(serviceType)) return ZERO_VND;
  return applyRate(rule.base === "before_discount" ? grossTotal : netTotal, rule.rate, "half-up");
}
