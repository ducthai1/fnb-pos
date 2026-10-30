import { formatVnd, vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import type { StoredOrder } from "../../src/features/order/stored-order";
import { cartView } from "../../src/features/order/cart-view";
import { REFUND_METHODS } from "../../src/features/refund/refund-command";
import { planRefund, refundableLines } from "../../src/features/refund/refund-plan";
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
import { UnpaidOrdersStrip } from "../../src/screens/sale/unpaid-orders-strip";
import { CashMoveScreen } from "../../src/screens/shift/cash-move-screen";
import { CloseShiftScreen } from "../../src/screens/shift/close-shift-screen";
import { RoundSlipsScreen } from "../../src/screens/table-order/round-slips-screen";
import { ADJUSTED, dayHistory } from "./pretty-adjusted-order";
import { PROFILE } from "./pretty-menu";
import { ORDER, PRICED, STAFF, menu, now } from "./pretty-order";
import { tillBar, tillHeader } from "./pretty-selling-screens";

// Voids, discounts, the drawer, closing the shift, the day's orders and refunds at the
// sample café, for the handbook's pictures.

/** Only the number and id of an unpaid order are drawn on the strip. */
const STORED_UNPAID = { orderId: "unpaid-1", deviceOrderNo: 12 } as never as StoredOrder;

const never = () => new Promise<never>(() => {});
const nothing = () => {};
// The tools and the steps over an order draw the plain bar, as on the till; the order
// itself (sale-adjusted) carries the selling modes and tools in its bar.
const header = tillBar();
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
// One of the two milk teas comes back.
const refund = planRefund({
  sale,
  refunds: [],
  selection: new Map([[sale.lines.find((l) => l.parentLineId === null)!.id, 1]]),
  refundOrderId: "0199f000-0000-7000-8000-00000000f001",
  businessDate: "2026-10-21",
});
const refundJob = refundSlip({
  menu,
  sale,
  refund,
  refundNo: 3,
  method: REFUND_METHODS.cash,
  cashierName: STAFF.cashier,
  at: now,
});
const closeJob = shiftCloseSlip({
  menu,
  shift,
  assessment: {
    expectedCash: figures.expectedCash,
    countedCash: vnd(1_790_000),
    difference: vnd(-9_000),
    needsAcceptance: false,
  },
  staffName: STAFF.cashier,
  at: now,
});

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
      header={tillHeader("counter")}
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
  "unpaid-orders-strip": () => (
    <SaleScreen
      header={tillHeader("counter")}
      menu={menu}
      now={now}
      order={ORDER}
      view={cartView(menu, ORDER, PROFILE, now)}
      adjust={adjust}
      saveFailed={false}
      notices={
        <UnpaidOrdersStrip
          orders={[
            { order: { ...STORED_UNPAID, deviceOrderNo: 12 }, items: 2, amountDue: vnd(58_000) },
            { order: { ...STORED_UNPAID, orderId: "unpaid-2", deviceOrderNo: 14 }, items: 1, amountDue: vnd(45_000) },
          ]}
          onReopen={nothing}
          onCancel={nothing}
        />
      }
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
      // A share of the two milk teas (100.000 đ), or the amount typed.
      preview={(input) => {
        const off = input.kind === "percent" ? (100_000 * input.rate) / 10_000 : Number(input.amount);
        return { discount: vnd(off), amountDue: vnd(Number(PRICED.totals.amountDue) - off) };
      }}
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
  // The same day with one sale's drawer open (the capture taps its row's number).
  "order-history-order": () => (
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
    <RefundScreen transferAllowed
      header={null}
      orderNo={ORDER.deviceOrderNo}
      lines={refundableLines(sale, [])}
      preview={() => ({ payout: refund.payout })}
      onConfirm={never}
      onBack={nothing}
    />
  ),
  // The layout test shows both slips on one screen; the till shows each after its own step.
  "refund-and-close-slips": () => (
    <RoundSlipsScreen
      header={header}
      title={vi.refund.doneTitle}
      notice={vi.refund.done(formatVnd(refund.payout), ORDER.deviceOrderNo)}
      backLabel={vi.refund.backToHistory}
      slips={[{ job: refundJob, outcome: { status: "preview_only" } }]}
      onBack={nothing}
    />
  ),
  "close-shift-slip": () => (
    <RoundSlipsScreen
      header={tillBar()}
      title={vi.closeShift.doneTitle}
      notice={vi.closeShift.done(formatVnd(vnd(-9_000)))}
      backLabel={vi.closeShift.openNext}
      slips={[{ job: closeJob, outcome: { status: "preview_only" } }]}
      onBack={nothing}
    />
  ),
} satisfies Record<string, () => ReactElement>;
