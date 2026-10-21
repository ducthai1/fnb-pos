import { formatVnd, vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { cartView } from "../../src/features/order/cart-view";
import { REFUND_METHODS } from "../../src/features/refund/refund-command";
import { planRefund } from "../../src/features/refund/refund-plan";
import { refundSlip } from "../../src/features/refund/refund-slip";
import { shiftCloseSlip } from "../../src/features/shift/shift-close-slip";
import { readStoredShift } from "../../src/features/shift/stored-shift";
import { vi } from "../../src/messages/vi";
import { ApprovalSheet } from "../../src/screens/approval/approval-sheet";
import { OrderHistoryScreen } from "../../src/screens/history/order-history-screen";
import { CancelOrderScreen } from "../../src/screens/order-adjust/cancel-order-screen";
import { DiscountScreen } from "../../src/screens/order-adjust/discount-screen";
import { VoidLineScreen } from "../../src/screens/order-adjust/void-line-screen";
import { RefundScreen } from "../../src/screens/refund/refund-screen";
import { SaleScreen } from "../../src/screens/sale/sale-screen";
import { CashMoveScreen } from "../../src/screens/shift/cash-move-screen";
import { CloseShiftScreen } from "../../src/screens/shift/close-shift-screen";
import { RoundSlipsScreen } from "../../src/screens/table-order/round-slips-screen";
import { ADJUSTED, REFUND_LINES, dayHistory } from "./pretty-adjusted-order";
import { PROFILE } from "./pretty-menu";
import { ORDER, PRICED, STAFF, menu, now } from "./pretty-order";
import { tillHeader } from "./pretty-selling-screens";

// Voids, discounts, the drawer, closing the shift, the day's orders and refunds at the
// sample café, for the handbook's pictures.

const never = () => new Promise<never>(() => {});
const nothing = () => {};
const header = tillHeader("counter");
const adjust = { onVoid: nothing, onDiscount: nothing, onDiscountOrder: nothing, onCancelOrder: nothing };
const approvers = [STAFF.barista, STAFF.manager].map((displayName, i) => ({ id: `a${i}`, displayName, active: true }));
const figures = {
  openingCash: vnd(500_000),
  cashSales: vnd(1_284_000),
  cashRefunds: vnd(35_000),
  cashIn: vnd(200_000),
  cashOut: vnd(150_000),
  expectedCash: vnd(1_799_000),
};
const history = dayHistory();
const sale = history.find((entry) => entry.status === "paid")!.order;
const shift = readStoredShift({
  id: "s",
  deviceId: "d",
  status: "open",
  businessDate: "2026-10-21",
  version: 1,
  openedByStaffId: "lan",
  figures: { openingCash: 500_000, cashSales: 1_284_000, cashRefunds: 35_000, cashIn: 200_000, cashOut: 150_000, expectedCash: 1_799_000 },
  close: null,
})!;
const itemName = "Trà sữa trân châu";

export const OPERATIONS_SCREENS = {
  // The till shows the sheet in place of the screen that asked for it.
  "approval-sheet": () => (
    <ApprovalSheet
      description={vi.approval.actions.lineDiscountRate("20%", itemName)}
      approvers={approvers}
      approve={never}
      onApproved={nothing}
      onCancel={nothing}
      onSessionExpired={nothing}
    />
  ),
  "sale-adjusted": () => (
    <SaleScreen
      header={header}
      menu={menu}
      now={now}
      order={ORDER}
      view={cartView(menu, ORDER, PROFILE, now, ADJUSTED.kept, ADJUSTED.commandLines)}
      kept={ADJUSTED.kept}
      commandLines={ADJUSTED.commandLines}
      adjust={adjust}
      saveFailed={false}
      onPick={nothing}
      onQuantity={nothing}
      onRemove={nothing}
      onServiceType={nothing}
      onCheckout={nothing}
    />
  ),
  "void-line": () => (
    <VoidLineScreen header={header} itemName="Cà phê muối" remaining={1} sentUnits={1} onConfirm={never} onBack={nothing} />
  ),
  discount: () => (
    <DiscountScreen
      header={header}
      title={vi.adjust.discount.titleLine(itemName)}
      preview={() => ({ discount: vnd(18_000), amountDue: vnd(Number(PRICED.totals.amountDue) - 18_000) })}
      onConfirm={never}
      onRemove={never}
      onBack={nothing}
    />
  ),
  "cancel-order": () => (
    <CancelOrderScreen header={header} orderNo={ORDER.deviceOrderNo} onConfirm={never} onBack={nothing} />
  ),
  "cash-move": () => (
    <CashMoveScreen header={header} notice={null} expectedAfter={() => vnd(1_649_000)} onConfirm={never} onBack={nothing} />
  ),
  "close-shift": () => (
    <CloseShiftScreen
      header={header}
      figures={figures}
      assess={(counted) => ({
        expectedCash: figures.expectedCash,
        countedCash: counted,
        difference: vnd(Number(counted) - Number(figures.expectedCash)),
        needsAcceptance: Math.abs(Number(counted) - Number(figures.expectedCash)) > 50_000,
      })}
      notice={null}
      onConfirm={never}
      onBack={nothing}
    />
  ),
  "order-history": () => (
    <OrderHistoryScreen
      header={null}
      day="2026-10-21"
      entries={history}
      filter="all"
      search=""
      onFilter={nothing}
      onSearch={nothing}
      onReopen={nothing}
      onRefund={nothing}
      onReprint={nothing}
      onBack={nothing}
    />
  ),
  refund: () => (
    <RefundScreen
      header={null}
      orderNo={ORDER.deviceOrderNo}
      lines={REFUND_LINES}
      preview={() => ({ payout: vnd(35_000) })}
      onConfirm={never}
      onBack={nothing}
    />
  ),
  "refund-and-close-slips": () => (
    <RoundSlipsScreen
      header={null}
      title={vi.refund.doneTitle}
      notice={vi.refund.done(formatVnd(vnd(35_000)), ORDER.deviceOrderNo)}
      slips={[
        refundSlip({
          menu,
          sale,
          refund: planRefund({
            sale,
            refunds: [],
            selection: new Map([[sale.lines.find((l) => l.parentLineId === null)!.id, 1]]),
            refundOrderId: "0199f000-0000-7000-8000-00000000f001",
            businessDate: "2026-10-21",
          }),
          refundNo: 3,
          method: REFUND_METHODS.cash,
          cashierName: STAFF.cashier,
          at: now,
        }),
        shiftCloseSlip({
          menu,
          shift,
          assessment: { expectedCash: figures.expectedCash, countedCash: vnd(1_790_000), difference: vnd(-9_000), needsAcceptance: false },
          staffName: STAFF.cashier,
          at: now,
        }),
      ].map((job) => ({ job, outcome: { status: "preview_only" as const } }))}
      onBack={nothing}
    />
  ),
} satisfies Record<string, () => ReactElement>;
