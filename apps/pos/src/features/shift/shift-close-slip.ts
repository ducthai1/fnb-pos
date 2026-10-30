import { type ClosingAssessment, formatBusinessDate, localClockParts } from "@fnb/domain";
import { PRINT_LABELS_VI, type PrintBlock, buildShiftClose } from "@fnb/printing";
import { vi } from "../../messages/vi";
import type { TillMenu } from "../menu/till-menu";
import { receiptJob } from "../printing/bill-slip";
import type { PrintJob } from "../printing/printer-port";
import type { StoredShift } from "./stored-shift";

/**
 * The closing slip: what the drawer should hold and what was counted, the difference worked
 * out by the template from the two. The shift's copy does not say when it opened, so the
 * slip names its business day there instead of a time it cannot know.
 */
export function shiftCloseSlip(input: {
  menu: TillMenu;
  shift: StoredShift;
  assessment: ClosingAssessment;
  staffName: string;
  at: number;
  /**
   * Printed from the till's own numbers before the server answered: the title says so, so
   * nobody files it as the shift's record.
   */
  provisional?: boolean;
}): PrintJob {
  const closedAt = localClockParts(input.at, input.menu.branch.utcOffsetMinutes);
  const document = buildShiftClose({
    shopName: input.menu.shopName,
    staffName: input.staffName,
    openedAt: closedAt,
    closedAt,
    methods: [
      {
        method: vi.checkout.methods.cash,
        expected: input.assessment.expectedCash,
        counted: input.assessment.countedCash,
      },
    ],
  });
  const dayOnly = document.map((block): PrintBlock => {
    if (block.kind === "columns" && block.left === PRINT_LABELS_VI.shiftOpened) {
      return {
        ...block,
        left: vi.closeShift.slipDay,
        right: formatBusinessDate(input.shift.businessDate),
      };
    }
    if (
      input.provisional === true &&
      block.kind === "text" &&
      block.text === PRINT_LABELS_VI.shiftCloseTitle
    ) {
      return { ...block, text: vi.closeShift.provisionalTitle };
    }
    return block;
  });
  return receiptJob(dayOnly, "shift_report");
}
