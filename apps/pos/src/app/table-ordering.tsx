import { useState } from "react";
import type { FloorArea } from "../features/floor/floor-occupancy";
import type { FloorTableView } from "../features/floor/floor-tables-view";
import { cartView } from "../features/order/cart-view";
import { addCartLine, removeCartLine, setLineQuantity } from "../features/order/counter-order";
import { needsNoChoice, plainLine } from "../features/order/plain-cart-line";
import type { PrintedSlip } from "../features/printing/print-sale-slips";
import type { TableOrderOpening } from "../features/table-order/table-order-opening";
import {
  moveGuests,
  owedToKitchen,
  printPreBill,
  sendRoundToKitchen,
} from "../features/table-order/table-order-rounds";
import { useTableOrder } from "../features/table-order/use-table-order";
import { vi } from "../messages/vi";
import { ModifierPickerScreen } from "../screens/sale/modifier-picker-screen";
import { RoundSlipsScreen } from "../screens/table-order/round-slips-screen";
import { TableOrderActions } from "../screens/table-order/table-order-actions";
import { TableOrderNotices } from "../screens/table-order/table-order-notices";
import { TableOrderScreen } from "../screens/table-order/table-order-screen";
import { TransferTableScreen } from "../screens/table-order/transfer-table-screen";
import { cancelTicketsScreen } from "../features/table-order/void-cancel-tickets";
import { UnderLayer } from "../screens/shared/under-layer";
import { CounterCheckout } from "./counter-checkout";
import { OrderAdjustmentFlow, adjustmentsFor } from "./order-adjustment-flow";
import type { TableOrderPhase } from "./table-order-phase";
import type { CounterSaleProps } from "./counter-sale";

export interface TableOrderingProps extends Omit<CounterSaleProps, "session" | "modeSwitch"> {
  opening: TableOrderOpening;
  /** The floor as the till sees it, for moving the guests to a free table. */
  areas: readonly FloorArea[];
  tables: readonly FloorTableView[];
  /** Orders the till has seen with a current pre-bill, for the floor's "changed" status. */
  preBilled: Set<string>;
  onRecorded(commandId: string): void;
  /** Back to the floor, with a sentence about what was just done there, if any. */
  onLeave(notice: string | null): void;
}

/** One table's order: rounds of items, each sent to the kitchen, the pre-bill, the payment. */
export function TableOrdering(props: TableOrderingProps) {
  const { client, place, menu, now, header, opening, onLeave } = props;
  const session = useTableOrder(client, place, menu, opening, props.onRecorded);
  const [phase, setPhase] = useState<TableOrderPhase>({ kind: "order" });
  const [wholeScreen, setWholeScreen] = useState(false);
  const { order, kept, sent, commandLines } = session;
  const view = cartView(menu, order, session.recorded().chargeProfile, now, kept, commandLines);
  const lines = view.kind === "priced" ? view.priced.lines : [];
  const owed = owedToKitchen(menu, order, lines, sent);
  const table = order.table ?? { id: "", name: "" };
  const rounds = { ...props, session, now: Date.now };
  const back = () => setPhase({ kind: "order" });

  async function showSlips(
    title: string,
    print: () => Promise<{ slips: readonly PrintedSlip[] | null; notice?: string }>,
  ) {
    setPhase({ kind: "slips", title, slips: null });
    const done = await print().catch((error: unknown) => {
      console.error(error);
      return { slips: [] };
    });
    setPhase({ ...done, kind: "slips", title, slips: done.slips ?? [] });
  }
  const sendRound = async () => ({ slips: await sendRoundToKitchen(rounds) });
  const preBill = async () => {
    const slip = await printPreBill(rounds);
    if (slip !== null && slip.outcome.status !== "failed") props.preBilled.add(order.orderId);
    return { slips: slip === null ? null : [slip] };
  };

  switch (phase.kind) {
    case "picking":
      return (
        <ModifierPickerScreen
          header={header}
          menu={menu}
          product={phase.product}
          now={now}
          onCancel={back}
          onAdd={(line) => {
            session.update((draft) => addCartLine(draft, line));
            back();
          }}
        />
      );
    case "slips":
      return <RoundSlipsScreen header={header} {...phase} onBack={back} />;
    case "adjusting":
      return (
        <OrderAdjustmentFlow
          {...rounds}
          step={phase.step}
          header={header}
          onDone={(outcome) => {
            if (outcome.kind === "cancelled")
              return onLeave(vi.adjust.cancel.done(order.deviceOrderNo));
            if (outcome.kind !== "voided" || outcome.record.fromSent === 0n) return back();
            const record = outcome.record;
            void showSlips(vi.adjust.void.cancelTicketTitle, () =>
              cancelTicketsScreen({ ...rounds, record }),
            );
          }}
        />
      );
    case "transfer":
      return (
        <TransferTableScreen
          header={header}
          from={table}
          areas={props.areas}
          tables={props.tables}
          onBack={back}
          onMove={async (to) => {
            if (await moveGuests(rounds, to)) onLeave(vi.tables.floor.moved(table.name, to.name));
          }}
        />
      );
  }
  const blocked = session.refusal !== null;
  const checkout = phase.kind === "checkout" ? phase.priced : null;
  return (
    <>
      <UnderLayer covered={checkout !== null} gone={checkout !== null && wholeScreen}>
        <TableOrderScreen
          header={header}
          menu={menu}
          now={now}
          order={order}
          view={view}
          kept={kept}
          commandLines={commandLines}
          sentIds={new Set(sent.map((line) => line.lineId))}
          adjust={adjustmentsFor((step) => setPhase({ kind: "adjusting", step }))}
          owed={owed.lineIds}
          saveFailed={session.saveFailed}
          notices={
            <TableOrderNotices
              refusal={session.refusal}
              preBill={session.preBill}
              leavingWithUnsent={phase.kind === "leaving" ? owed.units : null}
              onStay={back}
              onLeaveAnyway={() => onLeave(null)}
            />
          }
          onPick={(product) => {
            if (needsNoChoice(product))
              session.update((draft) => addCartLine(draft, plainLine(product)));
            else setPhase({ kind: "picking", product });
          }}
          onQuantity={(lineId, quantity) =>
            session.update((draft) => setLineQuantity(draft, lineId, quantity))
          }
          onRemove={(lineId) => session.update((draft) => removeCartLine(draft, lineId))}
          actions={
            <TableOrderActions
              owedUnits={owed.units}
              billable={view.kind === "priced" && order.lines.length > 0}
              saved={session.recorded().version > 0}
              blocked={blocked}
              onSend={() => void showSlips(vi.tables.slips.kitchenTitle, sendRound)}
              onPreBill={() => void showSlips(vi.tables.slips.preBillTitle, preBill)}
              onPay={() => {
                void session.saveAt(Date.now()).then((priced) => {
                  if (priced !== null) setPhase({ kind: "checkout", priced });
                });
              }}
              onTransfer={() => setPhase({ kind: "transfer" })}
              onBack={() => {
                if (owed.units > 0 && !blocked) setPhase({ kind: "leaving" });
                else onLeave(null);
              }}
            />
          }
        />
      </UnderLayer>
      {checkout === null ? null : (
        <CounterCheckout
          {...props}
          session={session}
          order={order}
          priced={checkout}
          nextOrderLabel={vi.tables.order.backToFloor}
          onBackToSale={back}
          onWholeScreen={setWholeScreen}
          onNextOrder={() => onLeave(null)}
        />
      )}
    </>
  );
}
