import { formatVnd } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import type { HistoryEntry } from "../features/history/order-history";
import { newId } from "../features/ids/new-id";
import type { TillMenu } from "../features/menu/till-menu";
import { adjustRefusal } from "../features/order-adjust/adjust-refusal";
import type { OrderNumbers } from "../features/order/device-order-number";
import { type TillPlace, businessDateAt } from "../features/order/till-command";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { jobReportedCommand } from "../features/printing/print-commands";
import { type PrintedSlip, printOne } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { refundCommand } from "../features/refund/refund-command";
import { type RefundSelection, planRefund, refundableLines } from "../features/refund/refund-plan";
import { refundSlip } from "../features/refund/refund-slip";
import { vi } from "../messages/vi";
import { RefundScreen } from "../screens/refund/refund-screen";
import { RoundSlipsScreen } from "../screens/table-order/round-slips-screen";
import { approvalOf, attempt } from "./adjust-flow-parts";

export interface RefundFlowProps {
  entry: HistoryEntry;
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  header: ReactNode;
  printer: PrinterPort;
  numbers: OrderNumbers;
  shiftId: string;
  cashierName: string;
  onBack(): void;
}

/**
 * Giving back part or all of a paid sale: the units chosen, what the domain says they come
 * to, a manager's approval when the cashier may not refund alone, then order.refund, paid out
 * at once (cash from the open shift's drawer), and its slip.
 */
export function RefundFlow(props: RefundFlowProps) {
  const { entry, place } = props;
  const sale = entry.order;
  const gate = useApprovalGate();
  const [refundOrderId] = useState(newId);
  const [done, setDone] = useState<{ slips: PrintedSlip[] | null; said: string } | null>(null);
  if (gate.sheet !== null) return gate.sheet;
  if (done !== null) {
    return (
      <RoundSlipsScreen
        header={props.header}
        title={vi.refund.doneTitle}
        slips={done.slips}
        notice={done.said}
        backLabel={vi.refund.backToHistory}
        onBack={props.onBack}
      />
    );
  }
  const plan = (selection: RefundSelection) =>
    planRefund({
      sale,
      refunds: entry.refunds,
      selection,
      refundOrderId,
      businessDate: businessDateAt(place, Date.now()),
    });

  return (
    <RefundScreen
      header={props.header}
      orderNo={sale.deviceOrderNo}
      lines={refundableLines(sale, entry.refunds)}
      preview={(selection) => {
        try {
          return { payout: plan(selection).payout };
        } catch (error) {
          return { refused: adjustRefusal(error) };
        }
      }}
      onBack={props.onBack}
      onConfirm={(selection, reasonCode, method) =>
        attempt(async () => {
          const refund = plan(selection);
          const amount = formatVnd(refund.payout);
          const said = vi.approval.actions.refund(amount, sale.deviceOrderNo);
          const outcome = await gate.require({ key: "refund" }, said);
          if (outcome.kind === "denied") return vi.approval.denied;
          const approval = approvalOf(outcome);
          if (approval === undefined) return null;
          const refundNo = await props.numbers.next();
          const at = Date.now();
          await props.client.enqueue(
            refundCommand({
              place,
              sale,
              refund,
              deviceOrderNo: refundNo,
              reasonCode,
              method,
              approvalId: approval?.approvalId ?? null,
              shiftId: props.shiftId,
              at,
            }),
          );
          const doneSaid = vi.refund.done(amount, sale.deviceOrderNo);
          setDone({ slips: null, said: doneSaid });
          const job = refundSlip({ ...props, sale, refund, refundNo, method, at });
          const printed = await printOne(props.printer, job);
          if (printed.status !== "preview_only") {
            await props.client.enqueue(
              jobReportedCommand(place, refund.built.order.id, job, printed, Date.now()),
            );
          }
          setDone({ slips: [{ job, outcome: printed }], said: doneSaid });
          return null;
        })
      }
    />
  );
}
