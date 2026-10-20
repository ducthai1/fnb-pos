import type { PosProduct } from "@fnb/contracts";
import { useState } from "react";
import type { FloorTableView } from "../features/floor/floor-tables-view";
import { cartView } from "../features/order/cart-view";
import { addCartLine, removeCartLine, setLineQuantity } from "../features/order/counter-order";
import { needsNoChoice, plainLine } from "../features/order/plain-cart-line";
import type { TableOrderOpening } from "../features/table-order/table-order-opening";
import { useTableOrder } from "../features/table-order/use-table-order";
import { vi } from "../messages/vi";
import { ModifierPickerScreen } from "../screens/sale/modifier-picker-screen";
import { TableOrderScreen } from "../screens/table-order/table-order-screen";
import type { CounterSaleProps } from "./counter-sale";

export interface TableOrderingProps extends Omit<CounterSaleProps, "session" | "modeSwitch"> {
  opening: TableOrderOpening;
  /** The floor as the till sees it, for moving the guests to a free table. */
  tables: readonly FloorTableView[];
  /** Orders the till has seen with a current pre-bill, for the floor's "changed" status. */
  preBilled: Set<string>;
  onRecorded(commandId: string): void;
  /** Back to the floor, with a sentence about what was just done there, if any. */
  onLeave(notice: string | null): void;
}

type Phase =
  { readonly kind: "order" } | { readonly kind: "picking"; readonly product: PosProduct };

const NOTHING_OWED: ReadonlySet<string> = new Set();

/** One table's order: items added round after round, each saved to the table at once. */
export function TableOrdering(props: TableOrderingProps) {
  const { client, place, menu, now, header, opening } = props;
  const session = useTableOrder(client, place, menu, opening, props.onRecorded);
  const [phase, setPhase] = useState<Phase>({ kind: "order" });
  const { order, kept } = session;
  const view = cartView(menu, order, session.recorded().chargeProfile, now, kept);

  if (phase.kind === "picking") {
    return (
      <ModifierPickerScreen
        header={header}
        menu={menu}
        product={phase.product}
        now={now}
        onCancel={() => setPhase({ kind: "order" })}
        onAdd={(line) => {
          session.update((draft) => addCartLine(draft, line));
          setPhase({ kind: "order" });
        }}
      />
    );
  }
  return (
    <TableOrderScreen
      header={header}
      menu={menu}
      now={now}
      order={order}
      view={view}
      kept={kept}
      owed={NOTHING_OWED}
      saveFailed={session.saveFailed}
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
        <button
          type="button"
          className="pos-button pos-button--quiet"
          onClick={() => props.onLeave(null)}
        >
          {vi.tables.order.backToFloor}
        </button>
      }
    />
  );
}
