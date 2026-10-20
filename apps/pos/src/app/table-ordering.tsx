import type { PosProduct } from "@fnb/contracts";
import { useState } from "react";
import type { FloorArea } from "../features/floor/floor-occupancy";
import type { FloorTableView } from "../features/floor/floor-tables-view";
import { cartView } from "../features/order/cart-view";
import { addCartLine, removeCartLine, setLineQuantity } from "../features/order/counter-order";
import { needsNoChoice, plainLine } from "../features/order/plain-cart-line";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
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
import { CounterCheckout } from "./counter-checkout";
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

type Phase =
  | { readonly kind: "order" | "transfer" | "leaving" }
  | { readonly kind: "picking"; readonly product: PosProduct }
  | {
      readonly kind: "slips";
      readonly title: string;
      readonly slips: readonly PrintedSlip[] | null;
    }
  | { readonly kind: "checkout"; readonly priced: PricedCounterOrder };

/** One table's order: rounds of items, each sent to the kitchen, the pre-bill, the payment. */
export function TableOrdering(props: TableOrderingProps) {
  const { client, place, menu, now, header, opening, onLeave } = props;
  const session = useTableOrder(client, place, menu, opening, props.onRecorded);
  const [phase, setPhase] = useState<Phase>({ kind: "order" });
  const { order, kept, sent } = session;
  const view = cartView(menu, order, session.recorded().chargeProfile, now, kept);
  const lines = view.kind === "priced" ? view.priced.lines : [];
  const owed = owedToKitchen(menu, order, lines, sent);
  const table = order.table ?? { id: "", name: "" };
  const rounds = { ...props, session, now: Date.now };
  const back = () => setPhase({ kind: "order" });

  async function showSlips(title: string, print: () => Promise<readonly PrintedSlip[] | null>) {
    setPhase({ kind: "slips", title, slips: null });
    const slips = await print().catch((error: unknown) => {
      console.error(error);
      return [];
    });
    setPhase({ kind: "slips", title, slips: slips ?? [] });
  }
  const preBill = async () => {
    const slip = await printPreBill(rounds);
    if (slip !== null && slip.outcome.status !== "failed") props.preBilled.add(order.orderId);
    return slip === null ? null : [slip];
  };

  switch (phase.kind) {
    case "checkout":
      return (
        <CounterCheckout
          {...props}
          session={session}
          order={order}
          priced={phase.priced}
          nextOrderLabel={vi.tables.order.backToFloor}
          onBackToSale={back}
          onNextOrder={() => onLeave(null)}
        />
      );
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
  return (
    <TableOrderScreen
      header={header}
      menu={menu}
      now={now}
      order={order}
      view={view}
      kept={kept}
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
          onSend={() =>
            void showSlips(vi.tables.slips.kitchenTitle, () => sendRoundToKitchen(rounds))
          }
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
  );
}
