import { formatVnd, vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { cartView } from "../../../src/features/order/cart-view";
import { vi } from "../../../src/messages/vi";
import { ApprovalSheet } from "../../../src/screens/approval/approval-sheet";
import { CancelOrderScreen } from "../../../src/screens/order-adjust/cancel-order-screen";
import { ChangeOptionsScreen } from "../../../src/screens/order-adjust/change-options-screen";
import { DiscountScreen } from "../../../src/screens/order-adjust/discount-screen";
import { VoidLineScreen } from "../../../src/screens/order-adjust/void-line-screen";
import { SaleScreen } from "../../../src/screens/sale/sale-screen";
import { CashMoveScreen } from "../../../src/screens/shift/cash-move-screen";
import { CloseShiftScreen } from "../../../src/screens/shift/close-shift-screen";
import { TillHeader } from "../../../src/screens/till/till-header";
import { TillTools } from "../../../src/screens/till/till-tools";
import { HOSTILE_MENU_NAMES } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";
import { ADJUSTED, NINE_DIGITS, operationsMenu as menu, profile } from "./hostile-operations";

// The screens that work on an order or the drawer, with the worst data; see screens-page.tsx.

const never = () => new Promise<never>(() => {});
const header = (
  <>
    <TillHeader
      branchName={HOSTILE_NAMES.branch}
      staffName={HOSTILE_NAMES.staff}
      status={{ connection: "origin_refused", pending: 123_456, needsAttention: 9_999 }}
      onOpenNeedsAttention={() => {}}
      onSwitchStaff={() => {}}
      onSignOut={() => {}}
    />
    <TillTools onOpen={() => {}} />
  </>
);
const approvers = [HOSTILE_NAMES.staff, HOSTILE_NAMES.emoji, HOSTILE_NAMES.decomposed].map(
  (displayName, i) => ({ id: `a${i}`, displayName, active: true }),
);
const adjust = {
  onVoid: () => {},
  onDiscount: () => {},
  onDiscountOrder: () => {},
  onCancelOrder: () => {},
};
const figures = {
  openingCash: NINE_DIGITS,
  cashSales: NINE_DIGITS,
  cashRefunds: NINE_DIGITS,
  cashIn: NINE_DIGITS,
  cashOut: NINE_DIGITS,
  expectedCash: NINE_DIGITS,
};

export const OPERATIONS_SCREENS = {
  "approval-sheet": () => (
    <ApprovalSheet
      description={vi.approval.actions.lineDiscountRate("12,5%", HOSTILE_MENU_NAMES.product)}
      approvers={approvers}
      approve={never}
      onApproved={() => {}}
      onCancel={() => {}}
      onSessionExpired={() => {}}
    />
  ),
  "sale-adjusted": () => (
    <SaleScreen
      header={header}
      menu={menu}
      now={Date.now()}
      order={HOSTILE_ORDER}
      view={cartView(
        menu,
        HOSTILE_ORDER,
        profile,
        Date.now(),
        ADJUSTED.kept,
        ADJUSTED.commandLines,
      )}
      kept={ADJUSTED.kept}
      commandLines={ADJUSTED.commandLines}
      adjust={adjust}
      saveFailed={false}
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      onServiceType={() => {}}
      onCheckout={() => {}}
    />
  ),
  "void-line": () => (
    <VoidLineScreen
      header={header}
      itemName={HOSTILE_MENU_NAMES.product}
      remaining={999}
      sentUnits={999}
      onConfirm={never}
      onBack={() => {}}
    />
  ),
  "change-options-failed": () => (
    <ChangeOptionsScreen
      header={header}
      itemName={HOSTILE_MENU_NAMES.product}
      failure={`${vi.adjust.void.orderDiscountWouldRise} ${HOSTILE_MENU_NAMES.note}`}
      closing={false}
      onRetry={() => {}}
      onBack={() => {}}
    />
  ),
  discount: () => (
    <DiscountScreen
      header={header}
      title={vi.adjust.discount.titleLine(HOSTILE_MENU_NAMES.product)}
      preview={() => ({ discount: NINE_DIGITS, amountDue: vnd(99_999_999_000) })}
      onConfirm={never}
      onRemove={never}
      onBack={() => {}}
    />
  ),
  "cancel-order": () => (
    <CancelOrderScreen header={header} orderNo={999_999_999} onConfirm={never} onBack={() => {}} />
  ),
  "cash-move": () => (
    <CashMoveScreen
      header={header}
      notice={vi.cash.done("out", `${NINE_DIGITS}`)}
      expectedAfter={() => vnd(99_999_999_000)}
      onConfirm={never}
      onBack={() => {}}
    />
  ),
  "close-shift": () => (
    <CloseShiftScreen
      header={header}
      figures={figures}
      assess={(counted) => ({
        expectedCash: NINE_DIGITS,
        countedCash: counted,
        difference: vnd(-987_654_321),
        needsAcceptance: true,
      })}
      notice={vi.closeShift.serverDisagreed(formatVnd(vnd(-987_654_321)))}
      onConfirm={never}
      onBack={() => {}}
    />
  ),
} satisfies Record<string, () => ReactElement>;
