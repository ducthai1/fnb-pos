import { type OrderLine, type Vnd, ZERO_VND, addVnd, formatVnd, negateVnd } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { percentOf } from "../../messages/vi-approval";
import type { DiscountPlan } from "./discount-adjustment";

const A = vi.approval.actions;

/** What discount lines take off, as the positive amount the customer is told. */
export const discountAmountOf = (lines: readonly OrderLine[]): Vnd =>
  addVnd(ZERO_VND, ...lines.map((line) => negateVnd(line.unitPrice)));

/**
 * The discount as a manager is asked to approve it: what was typed, and the share of the
 * item or order all its discounts then take when that is not the same figure.
 */
export function describeDiscount(plan: DiscountPlan, itemName: string | null): string {
  const { input } = plan;
  const what = input.kind === "percent" ? percentOf(input.rate) : formatVnd(input.amount);
  const said =
    itemName === null
      ? input.kind === "percent"
        ? A.orderDiscountRate(what)
        : A.orderDiscountAmount(what)
      : input.kind === "percent"
        ? A.lineDiscountRate(what, itemName)
        : A.lineDiscountAmount(what, itemName);
  const total = plan.action.discountRate ?? 0;
  if (input.kind === "percent" && input.rate === total) return said;
  return `${said} (${A.discountInAll(percentOf(total))})`;
}
