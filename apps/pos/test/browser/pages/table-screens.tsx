import { formatVnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { cartView } from "../../../src/features/order/cart-view";
import { priceCounterOrder } from "../../../src/features/order/price-counter-order";
import { kitchenSlips } from "../../../src/features/printing/kitchen-slips";
import { preBillSlip } from "../../../src/features/printing/pre-bill-slip";
import { FloorScreen } from "../../../src/screens/floor/floor-screen";
import { RoundSlipsScreen } from "../../../src/screens/table-order/round-slips-screen";
import { TableOrderActions } from "../../../src/screens/table-order/table-order-actions";
import { TableOrderNotices } from "../../../src/screens/table-order/table-order-notices";
import { TableOrderScreen } from "../../../src/screens/table-order/table-order-screen";
import { TransferTableScreen } from "../../../src/screens/table-order/transfer-table-screen";
import { SellingModeSwitch } from "../../../src/screens/till/selling-mode-switch";
import { TillBarNav } from "../../../src/screens/till/till-bar-nav";
import { TillHeader } from "../../../src/screens/till/till-header";
import { TillTools } from "../../../src/screens/till/till-tools";
import { hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";
import {
  HOSTILE_AREAS,
  HOSTILE_FLOOR_NAMES,
  HOSTILE_PLAN_TABLES,
  HOSTILE_TABLES,
} from "./hostile-floor";

// Serving at tables with the worst data a shop can enter; see screens-page.tsx.

const menu = hostileTillMenu();
const now = Date.now();
const profile = { pricesIncludeTax: false, serviceCharge: null };
const header = (
  <TillBarNav
    nav={
      <div className="pos-navbar">
        <SellingModeSwitch mode="tables" onChange={() => {}} />
        <TillTools onOpen={() => {}} />
      </div>
    }
  >
    <TillHeader
      branchName={HOSTILE_NAMES.branch}
      staffName={HOSTILE_NAMES.staff}
      status={{ connection: "offline", pending: 123_456, needsAttention: 9_999 }}
      onOpenNeedsAttention={() => {}}
      onSwitchStaff={() => {}}
      onSignOut={() => {}}
    />
  </TillBarNav>
);
const seat = { id: "table-0", name: HOSTILE_FLOOR_NAMES.table };
const order = { ...HOSTILE_ORDER, serviceType: "dine_in" as const, tableTag: null, table: seat };
const priced = priceCounterOrder(menu, order, profile, now);
// The first round (the 999 long-named teas) went to the bar; the rest has not.
const firstItem = order.lines[0]!.lineId;
const kept = new Map([
  [firstItem, priced.lines.filter((l) => l.id === firstItem || l.parentLineId === firstItem)],
]);
const slipOrder = { order, priced, businessDate: "2026-10-20", version: 3, sent: [] };
const never = () => new Promise<never>(() => {});
const slips = [
  ...kitchenSlips(menu, slipOrder, now).map((ticket) => ticket.job),
  preBillSlip(menu, slipOrder, false, HOSTILE_NAMES.staff, now),
].map((job) => ({ job, outcome: { status: "preview_only" as const } }));

export const TABLE_SCREENS = {
  floor: () => (
    <FloorScreen
      header={header}
      areas={HOSTILE_AREAS}
      tables={HOSTILE_TABLES}
      now={now}
      loadError={`${HOSTILE_NAMES.unknownCode} ${formatVnd(priced.totals.amountDue)}`}
      notice={<p className="pos-notice">{HOSTILE_NAMES.emoji}</p>}
      onOpenTable={() => {}}
    />
  ),
  // The same floor drawn where the editor placed the tables, at the editor's limits.
  "floor-plan": () => (
    <FloorScreen
      header={header}
      areas={HOSTILE_AREAS}
      tables={HOSTILE_PLAN_TABLES}
      now={now}
      loadError={null}
      notice={null}
      initialView="plan"
      onOpenTable={() => {}}
    />
  ),
  "table-order": () => (
    <TableOrderScreen
      header={header}
      menu={menu}
      now={now}
      order={order}
      view={cartView(menu, order, profile, now, kept)}
      kept={kept}
      sentIds={new Set(kept.keys())}
      owed={new Set(order.lines.slice(1).map((line) => line.lineId))}
      saveFailed
      notices={
        <TableOrderNotices
          refusal={{ type: "table.transfer", code: HOSTILE_NAMES.unknownCode }}
          preBill="changed"
          leavingWithUnsent={999_999}
          onStay={() => {}}
          onLeaveAnyway={() => {}}
        />
      }
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      actions={
        <TableOrderActions
          owedUnits={999_999}
          billable
          saved
          blocked={false}
          onSend={() => {}}
          onPreBill={() => {}}
          onPay={() => {}}
          onTransfer={() => {}}
          onBack={() => {}}
        />
      }
    />
  ),
  "transfer-table": () => (
    <TransferTableScreen
      header={header}
      from={{ id: "table-9", name: HOSTILE_FLOOR_NAMES.table }}
      areas={HOSTILE_AREAS}
      tables={HOSTILE_TABLES}
      onMove={never}
      onBack={() => {}}
    />
  ),
  "table-slips": () => (
    <RoundSlipsScreen header={header} title={HOSTILE_NAMES.staff} slips={slips} onBack={() => {}} />
  ),
} satisfies Record<string, () => ReactElement>;
