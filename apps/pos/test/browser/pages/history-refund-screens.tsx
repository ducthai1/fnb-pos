import { vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { REFUND_METHODS } from "../../../src/features/refund/refund-command";
import { planRefund } from "../../../src/features/refund/refund-plan";
import { refundSlip } from "../../../src/features/refund/refund-slip";
import { shiftCloseSlip } from "../../../src/features/shift/shift-close-slip";
import { readStoredShift } from "../../../src/features/shift/stored-shift";
import { vi } from "../../../src/messages/vi";
import { OrderHistoryScreen } from "../../../src/screens/history/order-history-screen";
import { RefundScreen } from "../../../src/screens/refund/refund-screen";
import { RoundSlipsScreen } from "../../../src/screens/table-order/round-slips-screen";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import {
  HOSTILE_REFUND_LINES,
  NINE_DIGITS,
  hostileHistory,
  operationsMenu,
} from "./hostile-operations";

// The day's orders and refunds with the worst data; see screens-page.tsx.

const never = () => new Promise<never>(() => {});
const history = hostileHistory();
const sale = history.find((entry) => entry.status === "paid")!.order;
const shift = readStoredShift({
  id: "s",
  deviceId: "d",
  status: "open",
  businessDate: "2026-10-20",
  version: 1,
  openedByStaffId: "lan",
  figures: { openingCash: 0, cashSales: 0, cashRefunds: 0, cashIn: 0, cashOut: 0, expectedCash: 0 },
  close: null,
})!;

export const HISTORY_REFUND_SCREENS = {
  "order-history": () => (
    <OrderHistoryScreen
      header={null}
      day="2026-10-20"
      entries={history}
      filter="all"
      search={HOSTILE_NAMES.unknownCode}
      onFilter={() => {}}
      onSearch={() => {}}
      onReopen={() => {}}
      onRefund={() => {}}
      onReprint={() => {}}
      onBack={() => {}}
    />
  ),
  refund: () => (
    <RefundScreen
      transferAllowed
      header={null}
      orderNo={999_999_999}
      lines={HOSTILE_REFUND_LINES}
      preview={() => ({ payout: NINE_DIGITS })}
      onConfirm={never}
      onBack={() => {}}
    />
  ),
  "refund-and-close-slips": () => (
    <RoundSlipsScreen
      header={null}
      title={vi.refund.doneTitle}
      notice={vi.refund.done(`${NINE_DIGITS}`, 999_999_999)}
      backLabel={vi.closeShift.openNext}
      slips={[
        refundSlip({
          menu: operationsMenu,
          sale,
          refund: planRefund({
            sale,
            refunds: [],
            selection: new Map(
              sale.lines.filter((l) => l.parentLineId === null).map((l) => [l.id, 1]),
            ),
            refundOrderId: "0199f000-0000-7000-8000-00000000f001",
            businessDate: "2026-10-20",
          }),
          refundNo: 999_999_999,
          method: REFUND_METHODS.bankTransfer,
          cashierName: HOSTILE_NAMES.staff,
          at: Date.now(),
        }),
        shiftCloseSlip({
          menu: operationsMenu,
          shift,
          assessment: {
            expectedCash: NINE_DIGITS,
            countedCash: vnd(1_000),
            difference: vnd(-987_653_321),
            needsAcceptance: true,
          },
          staffName: HOSTILE_NAMES.staff,
          at: Date.now(),
        }),
      ].map((job) => ({ job, outcome: { status: "preview_only" as const } }))}
      onBack={() => {}}
    />
  ),
} satisfies Record<string, () => ReactElement>;
