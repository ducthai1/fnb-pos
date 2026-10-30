import type { ReactElement } from "react";
import { cartView } from "../../src/features/order/cart-view";
import { priceCounterOrder } from "../../src/features/order/price-counter-order";
import { kitchenSlips } from "../../src/features/printing/kitchen-slips";
import { preBillSlip } from "../../src/features/printing/pre-bill-slip";
import { FloorScreen } from "../../src/screens/floor/floor-screen";
import { RoundSlipsScreen } from "../../src/screens/table-order/round-slips-screen";
import { TableOrderActions } from "../../src/screens/table-order/table-order-actions";
import { TableOrderScreen } from "../../src/screens/table-order/table-order-screen";
import { TransferTableScreen } from "../../src/screens/table-order/transfer-table-screen";
import { vi } from "../../src/messages/vi";
import { AREAS, TABLES } from "./pretty-floor";
import { PROFILE } from "./pretty-menu";
import { ORDER, STAFF, menu, now } from "./pretty-order";
import { tillBar, tillHeader } from "./pretty-selling-screens";

// Serving at the sample café's tables, for the handbook's pictures.

const never = () => new Promise<never>(() => {});
const nothing = () => {};
// The floor carries the selling modes and tools in its bar; a table's own screens, as on
// the till, draw the plain bar.
const floorHeader = tillHeader("tables");
const header = tillBar();
const seat = { id: "table-T02", name: "T02" };
const order = { ...ORDER, serviceType: "dine_in" as const, table: seat };
const priced = priceCounterOrder(menu, order, PROFILE, now);
// The first round (the two milk teas) went to the bar; the coffees have not yet.
const firstItem = order.lines[0]!.lineId;
const kept = new Map([
  [firstItem, priced.lines.filter((l) => l.id === firstItem || l.parentLineId === firstItem)],
]);
const slipOrder = { order, priced, businessDate: "2026-10-21", version: 3, sent: [] };
const slips = [
  ...kitchenSlips(menu, slipOrder, now).map((ticket) => ticket.job),
  preBillSlip(menu, slipOrder, false, STAFF.cashier, now),
].map((job) => ({ job, outcome: { status: "preview_only" as const } }));
const floor = (view: "plan" | "grid") => (
  <FloorScreen
    header={floorHeader}
    areas={AREAS}
    tables={TABLES}
    now={now}
    loadError={null}
    notice={null}
    initialView={view}
    onOpenTable={nothing}
  />
);

export const TABLE_SCREENS = {
  floor: () => floor("grid"),
  "floor-plan": () => floor("plan"),
  "table-order": () => (
    <TableOrderScreen
      header={header}
      menu={menu}
      now={now}
      order={order}
      view={cartView(menu, order, PROFILE, now, kept)}
      kept={kept}
      sentIds={new Set(kept.keys())}
      owed={new Set(order.lines.slice(1).map((line) => line.lineId))}
      saveFailed={false}
      notices={null}
      onPick={nothing}
      onQuantity={nothing}
      onRemove={nothing}
      actions={
        <TableOrderActions
          owedUnits={2}
          billable
          saved
          blocked={false}
          empty={false}
          onSend={nothing}
          onPreBill={nothing}
          onPay={nothing}
          onTransfer={nothing}
          onRelease={nothing}
          onBack={nothing}
        />
      }
    />
  ),
  "transfer-table": () => (
    <TransferTableScreen header={header} from={seat} areas={AREAS} tables={TABLES} onMove={never} onBack={nothing} />
  ),
  "table-slips": () => (
    <RoundSlipsScreen header={header} title={vi.tables.order.title("T02")} slips={slips} onBack={nothing} />
  ),
} satisfies Record<string, () => ReactElement>;
