import {
  type Vnd,
  acceptCloseDifference,
  assessClosingCount,
  formatVnd,
  summarizeShiftCash,
} from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import type { ReactNode } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import type { TillPlace } from "../features/order/till-command";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { jobReportedCommand } from "../features/printing/print-commands";
import { type PrintedSlip, printOne } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { closeToleranceOf } from "../features/shift/close-tolerance";
import { shiftCloseSlip } from "../features/shift/shift-close-slip";
import { closeShiftCommand } from "../features/shift/shift-commands";
import { useCloseRefused } from "../features/shift/use-close-refused";
import { useShiftLedger } from "../features/shift/use-shift-ledger";
import { vi } from "../messages/vi";
import { CloseShiftScreen } from "../screens/shift/close-shift-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";
import { approvalOf, attempt } from "./adjust-flow-parts";

const T = vi.closeShift;

/** What the till shows once the close is recorded: its slip, and what the count came to. */
export interface ShiftClosing {
  readonly slips: readonly PrintedSlip[] | null;
  readonly said: string;
}

export interface CloseShiftFlowProps {
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  header: ReactNode;
  printer: PrinterPort;
  shiftId: string;
  cashierName: string;
  onBack(): void;
  /**
   * Runs the close (record it, print its slip) outside this screen, which goes away as soon
   * as the shift reads closed.
   */
  onClose(run: () => Promise<ShiftClosing>): void;
}

/**
 * Closing the shift: the drawer counted note by note against the server's book of the shift
 * (plus the till's cash still waiting to sync), a difference beyond the shop's tolerance
 * accepted by a manager for that very difference, shift.close, then the closing slip.
 */
export function CloseShiftFlow(props: CloseShiftFlowProps) {
  const { client, place, menu } = props;
  const gate = useApprovalGate();
  const { authority } = useTillPermissions();
  const book = useShiftLedger(client, props.shiftId);
  const refusedCount = useCloseRefused(client, props.shiftId);
  if (gate.sheet !== null) return gate.sheet;
  if (book === null) {
    return (
      <ScreenFrame title={T.title}>
        {props.header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  const tolerance = closeToleranceOf(menu.config.settings);
  const assess = (counted: Vnd) => assessClosingCount(book.ledger, counted, tolerance);
  // What the server's figures make of the count it refused, not what the till first thought.
  const disagreed = refusedCount === null ? null : assess(refusedCount).difference;
  return (
    <CloseShiftScreen
      header={props.header}
      figures={summarizeShiftCash(book.ledger)}
      assess={assess}
      notice={disagreed === null ? null : T.serverDisagreed(formatVnd(disagreed))}
      onBack={props.onBack}
      onConfirm={(counts, assessment) =>
        attempt(async () => {
          let approvalId: string | null = null;
          if (assessment.needsAcceptance || disagreed !== null) {
            const said = vi.approval.actions.closeDifference(formatVnd(assessment.difference));
            const action = {
              ...acceptCloseDifference(assessment.difference),
              subject: { shiftId: book.shift.id },
            };
            const outcome = await gate.require(action, said);
            if (outcome.kind === "denied") return vi.approval.denied;
            const approval = approvalOf(outcome);
            if (approval === undefined) return null;
            approvalId = approval?.approvalId ?? null;
          }
          const at = Date.now();
          const { shift } = book;
          const command = closeShiftCommand(
            place,
            shift,
            authority.staffId,
            counts,
            assessment,
            approvalId,
            at,
          );
          props.onClose(async () => {
            await client.enqueue(command);
            const staffName = props.cashierName;
            const job = shiftCloseSlip({ menu, shift, assessment, staffName, at });
            const printed = await printOne(props.printer, job);
            if (printed.status !== "preview_only") {
              const report = jobReportedCommand(
                place,
                shift.id,
                job,
                printed,
                Date.now(),
                shift.id,
              );
              await client.enqueue(report);
            }
            return {
              slips: [{ job, outcome: printed }],
              said: T.done(formatVnd(assessment.difference)),
            };
          });
          return null;
        })
      }
    />
  );
}
