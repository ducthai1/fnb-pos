import { useEffect, useRef, useState } from "react";
import { type VoidRecord, formatGrams, quantity, reversedQuantityOf, subtractQuantity } from "@fnb/domain";
import {
  type Approval,
  planVoid,
  voidAdjustment,
} from "../features/order-adjust/void-line-adjustment";
import type { ChosenReason } from "../features/order-adjust/reason-codes";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import type { CartLine } from "../features/order/counter-order";
import type { TillMenu } from "../features/menu/till-menu";
import { vi } from "../messages/vi";
import { ChangeOptionsScreen } from "../screens/order-adjust/change-options-screen";
import { VoidLineScreen } from "../screens/order-adjust/void-line-screen";
import { type AdjustContext, approvalOf, attempt, nameOn, units } from "./adjust-flow-parts";
import { useFinishThen } from "../screens/shared/use-leave-motion";

const voidNeedsApproval = (menu: TillMenu) =>
  menu.config.settings.void_after_sent_needs_approval !== false;

/**
 * Cancelling units of an item: the domain takes those the kitchen never saw first; the rest
 * need a manager where the branch asks for one, and leave a cancel line (and a ticket).
 * With `replacement`, the whole item is cancelled at once for the reason "customer changed
 * their mind" (no count to pick, no reason to give): the cashier has already chosen what
 * takes its place, and the caller puts it on the order once the cancel is recorded.
 */
export function VoidLineFlow(props: AdjustContext & { lineId: string; replacement?: CartLine }) {
  const { settled, lineId } = props;
  const gate = useApprovalGate();
  // The step sinks away when its work is done, as it does when backed out of.
  const { closing, finish } = useFinishThen(props.onDone);
  const { authority } = useTillPermissions();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);
  const finished = useRef(false);
  const attemptNow = useRef<() => void>(() => {});
  const replacing = props.replacement !== undefined;
  useEffect(() => {
    if (!replacing || started.current) return;
    started.current = true;
    attemptNow.current();
  }, [replacing]);
  if (gate.sheet !== null) return gate.sheet;
  const lines = settled.priced.lines;
  const item = lines.find((line) => line.id === lineId);
  const reversed = reversedQuantityOf(lines, lineId);
  const sent = settled.sent.find((line) => line.lineId === lineId)?.sentQuantity ?? 0n;
  const name = nameOn(settled, lineId);
  // An item sold by weight is cancelled as the whole weighing, never part of it.
  const grams = settled.order.lines.find((line) => line.lineId === lineId)?.grams;
  const left = item === undefined ? quantity(0) : subtractQuantity(item.quantity, reversed);

  const confirm = (count: number, reason: ChosenReason) =>
    attempt(async () => {
      const request = {
        lineId,
        quantity: grams === undefined ? quantity(count) : left,
        reason,
        staffId: authority.staffId,
      };
      const plan = planVoid(settled, request);
      const raised = plan.raisedOrderDiscountRate;
      if (
        raised !== null &&
        authority.decide({ key: "order_discount", discountRate: raised }) !== "allowed"
      ) {
        return vi.adjust.void.orderDiscountWouldRise;
      }
      let approval: Approval | null = null;
      if (plan.record.fromSent > 0n && voidNeedsApproval(props.menu)) {
        const said =
          grams === undefined
            ? vi.approval.actions.voidAfterSent(units(plan.record.fromSent), name)
            : vi.approval.actions.voidWeighedAfterSent(formatGrams(grams), name);
        // The approval covers these units of this line of this order only.
        const action = {
          key: "void_after_sent",
          voidedQuantity: plan.record.fromSent,
          subject: { orderId: settled.order.orderId, lineId },
        } as const;
        const outcome = await gate.require(action, said);
        if (outcome.kind === "denied") return vi.approval.denied;
        const given = approvalOf(outcome);
        if (given === undefined) return null;
        approval = given;
      }
      let record: VoidRecord | null = null;
      await props.session.adjust((now) => {
        const adjusted = voidAdjustment(props.place, now, request, approval, Date.now());
        record = adjusted.record;
        return adjusted;
      });
      finished.current = true;
      finish(record === null ? { kind: "adjusted" } : { kind: "voided", record });
      return null;
    });

  if (replacing) {
    attemptNow.current = () => {
      setFailure(null);
      void confirm(units(left), { code: "customer_changed_mind", note: null }).then((refused) => {
        if (refused !== null) setFailure(refused);
        // Nobody approved (the sheet was closed): nothing was cancelled, back to the order.
        else if (!finished.current) finish({ kind: "back" });
      });
    };
    return (
      <ChangeOptionsScreen
        header={props.header}
        itemName={name}
        failure={failure}
        closing={closing}
        onRetry={() => attemptNow.current()}
        onBack={() => props.onDone({ kind: "back" })}
      />
    );
  }

  return (
    <VoidLineScreen
      closing={closing}
      header={props.header}
      itemName={name}
      {...(grams === undefined ? {} : { weighedGrams: grams })}
      remaining={grams === undefined ? units(left) : left > 0n ? 1 : 0}
      sentUnits={grams === undefined ? units(sent - reversed) : sent > reversed ? 1 : 0}
      onBack={() => props.onDone({ kind: "back" })}
      onConfirm={confirm}
    />
  );
}
