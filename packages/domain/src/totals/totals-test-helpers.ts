import { type BasisPoints, type Quantity, basisPoints, vnd } from "../money";
import type { OrderLine, ServiceType } from "../order";
import { line } from "../order/order-line-test-fixtures";
import type { OrderChargeProfile, OrderTotalsInput, ServiceChargeRule } from "./order-totals-types";

export const VAT_0 = basisPoints(0);
export const VAT_8 = basisPoints(800);
export const VAT_10 = basisPoints(1000);

// Lines come from the shared order-line builder and only override what the totals read, so a
// field added to OrderLine later reaches these tests through that builder.
function priced(base: OrderLine, unitPrice: number, taxRate: BasisPoints): OrderLine {
  return { ...base, unitPrice: vnd(unitPrice), taxRate };
}

export const itemLine = (id: string, price: number, rate: BasisPoints, qty?: Quantity) =>
  priced(line(id, "item", null, qty), price, rate);

export const modifierLine = (
  id: string,
  parentId: string,
  price: number,
  rate: BasisPoints,
  qty?: Quantity,
) => priced(line(id, "modifier", parentId, qty), price, rate);

export const componentLine = (
  id: string,
  parentId: string,
  price: number,
  rate: BasisPoints,
  qty?: Quantity,
) => priced(line(id, "combo_component", parentId, qty), price, rate);

/** `amount` is the reduction as a positive number; the line carries it as a negative price. */
export const discountLine = (
  id: string,
  parentId: string | null,
  amount: number,
  rate: BasisPoints,
  qty?: Quantity,
) => priced(line(id, "discount", parentId, qty), -amount, rate);

export function orderOf(
  lines: readonly OrderLine[],
  serviceType: ServiceType = "dine_in",
): OrderTotalsInput {
  return { lines, serviceType };
}

export const TAX_EXCLUSIVE: OrderChargeProfile = { pricesIncludeTax: false, serviceCharge: null };
export const TAX_INCLUSIVE: OrderChargeProfile = { pricesIncludeTax: true, serviceCharge: null };

/** 5% on dine-in, taxed at 10%, unless overridden. */
export function withServiceCharge(
  profile: OrderChargeProfile,
  rule: Partial<ServiceChargeRule> = {},
): OrderChargeProfile {
  return {
    ...profile,
    serviceCharge: {
      rate: basisPoints(500),
      appliesTo: ["dine_in"],
      base: "after_discount",
      taxRate: VAT_10,
      ...rule,
    },
  };
}
