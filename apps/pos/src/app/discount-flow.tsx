import { type DiscountScope, computeOrderTotals } from "@fnb/domain";
import { adjustRefusal } from "../features/order-adjust/adjust-refusal";
import { describeDiscount, discountAmountOf } from "../features/order-adjust/describe-discount";
import {
  type DiscountInput,
  discountAdjustment,
  discountLinesOf,
  planDiscount,
  removeDiscountAdjustment,
} from "../features/order-adjust/discount-adjustment";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { vi } from "../messages/vi";
import { DiscountScreen } from "../screens/order-adjust/discount-screen";
import { type AdjustContext, approvalOf, attempt, nameOn } from "./adjust-flow-parts";

/** A discount on an item or the order, judged by the share all such discounts then take. */
export function DiscountFlow(props: AdjustContext & { scope: DiscountScope }) {
  const { settled, scope, session, place } = props;
  const gate = useApprovalGate();
  if (gate.sheet !== null) return gate.sheet;
  const lines = settled.priced.lines;
  const itemName = scope.kind === "line" ? nameOn(settled, scope.lineId) : null;
  const done = () => props.onDone({ kind: "adjusted" });

  const preview = (input: DiscountInput) => {
    try {
      const plan = planDiscount(settled, scope, input);
      const totals = computeOrderTotals(
        { lines: [...lines, ...plan.lines], serviceType: settled.order.serviceType },
        settled.state.chargeProfile,
      );
      return { discount: discountAmountOf(plan.lines), amountDue: totals.amountDue };
    } catch (error) {
      return { refused: adjustRefusal(error) };
    }
  };
  const remove = () =>
    attempt(async () => {
      await session.adjust((now) => {
        const removed = removeDiscountAdjustment(place, now, scope, Date.now());
        if (removed === null) throw new Error("no discount left to remove");
        return removed;
      });
      done();
      return null;
    });
  const confirm = (input: DiscountInput) =>
    attempt(async () => {
      const plan = planDiscount(settled, scope, input);
      const outcome = await gate.require(plan.action, describeDiscount(plan, itemName));
      if (outcome.kind === "denied") return vi.approval.denied;
      const approval = approvalOf(outcome);
      if (approval === undefined) return null;
      await session.adjust((now) => discountAdjustment(place, now, plan, approval, Date.now()));
      done();
      return null;
    });

  return (
    <DiscountScreen
      header={props.header}
      title={
        itemName === null ? vi.adjust.discount.titleOrder : vi.adjust.discount.titleLine(itemName)
      }
      preview={preview}
      onBack={() => props.onDone({ kind: "back" })}
      onRemove={discountLinesOf(lines, scope).length > 0 ? remove : undefined}
      onConfirm={confirm}
    />
  );
}
