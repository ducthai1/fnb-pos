import { applyDiscountPayloadSchema, removeDiscountPayloadSchema } from "@fnb/contracts";
import {
  type BasisPoints,
  type DiscountScope,
  type OrderLine,
  type PermissionAction,
  type Vnd,
  buildLineDiscount,
  buildOrderDiscountLines,
  projectedDiscountRate,
} from "@fnb/domain";
import { newId } from "../ids/new-id";
import { itemTree } from "../order/command-made-lines";
import type { AdjustableOrder, Adjusted } from "../order/order-session-types";
import { type TillPlace, moneyToWire } from "../order/till-command";
import type { Approval } from "./void-line-adjustment";
import { adjustedWith } from "./adjusted-order";

/** How much off: a share of what is still due, or a fixed amount the customer was told. */
export type DiscountInput =
  | { readonly kind: "percent"; readonly rate: BasisPoints }
  | { readonly kind: "amount"; readonly amount: Vnd };

/** The share rounds to 0 đ on what is due: there is nothing to give. */
export class DiscountRoundsToNothingError extends Error {
  constructor() {
    super("the discount comes to nothing");
    this.name = "DiscountRoundsToNothingError";
  }
}

export interface DiscountPlan {
  readonly scope: DiscountScope;
  readonly input: DiscountInput;
  /** The lines the domain builds, one per tax rate in what it reduces. */
  readonly lines: readonly OrderLine[];
  /** What it is judged by: the share all discounts of its kind take once it is added. */
  readonly action: PermissionAction;
}

/**
 * The discount built by the domain on the order as last saved, with ids made here: the server
 * builds it again on its copy with the same ids in the same order, so both come to the same
 * lines. Throws the domain's refusal (a fixed amount above what is due).
 */
export function planDiscount(
  settled: AdjustableOrder,
  scope: DiscountScope,
  input: DiscountInput,
): DiscountPlan {
  const order = { lines: settled.priced.lines };
  const lines =
    scope.kind === "order"
      ? buildOrderDiscountLines(
          order,
          input.kind === "percent" ? input : { kind: "fixed", amount: input.amount },
          newId,
        )
      : buildLineDiscount(
          order,
          scope.lineId,
          input.kind === "percent" ? input : { kind: "fixed_for_line", amount: input.amount },
          newId,
        );
  if (lines.length === 0) throw new DiscountRoundsToNothingError();
  const discountRate = projectedDiscountRate(order, lines, scope);
  const key = scope.kind === "order" ? "order_discount" : "line_discount";
  return { scope, input, lines, action: { key, discountRate } };
}

const wireDiscount = (plan: DiscountPlan) => {
  if (plan.input.kind === "percent") return { kind: "percent", rate: plan.input.rate };
  const amount = moneyToWire(plan.input.amount);
  return plan.scope.kind === "order"
    ? { kind: "fixed", amount }
    : { kind: "fixed_for_line", amount };
};

/** order.apply_discount as planned; an item discounted is held as it is from then on. */
export function discountAdjustment(
  place: TillPlace,
  settled: AdjustableOrder,
  plan: DiscountPlan,
  approval: Approval | null,
  at: number,
): Adjusted {
  const lines = [...settled.priced.lines, ...plan.lines];
  const kept = new Map(settled.kept);
  if (plan.scope.kind === "line") kept.set(plan.scope.lineId, itemTree(lines, plan.scope.lineId));
  const payload = {
    orderId: settled.order.orderId,
    scope: plan.scope.kind,
    ...(plan.scope.kind === "line" ? { lineId: plan.scope.lineId } : {}),
    discount: wireDiscount(plan),
    discountLineIds: plan.lines.map((line) => line.id),
    ...(approval === null ? {} : { approvalId: approval.approvalId }),
  };
  return adjustedWith(
    place,
    settled,
    { order: settled.order, kept, lines },
    { type: "order.apply_discount", contract: applyDiscountPayloadSchema, payload },
    at,
  );
}

/** The discount lines of a scope: the order's own, or those under one item. */
export const discountLinesOf = (lines: readonly OrderLine[], scope: DiscountScope) =>
  lines.filter(
    (line) =>
      line.lineType === "discount" &&
      line.parentLineId === (scope.kind === "order" ? null : scope.lineId),
  );

/**
 * order.remove_discount of every discount of a scope. It only raises what is due, so it needs
 * nobody; an item stays held, since what else points at it is the server's to know.
 */
export function removeDiscountAdjustment(
  place: TillPlace,
  settled: AdjustableOrder,
  scope: DiscountScope,
  at: number,
): Adjusted | null {
  const removed = new Set(discountLinesOf(settled.priced.lines, scope).map((line) => line.id));
  if (removed.size === 0) return null;
  const lines = settled.priced.lines.filter((line) => !removed.has(line.id));
  const payload = { orderId: settled.order.orderId, discountLineIds: [...removed] };
  return adjustedWith(
    place,
    settled,
    { order: settled.order, kept: settled.kept, lines },
    { type: "order.remove_discount", contract: removeDiscountPayloadSchema, payload },
    at,
  );
}
