import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { FloorTableView } from "../features/floor/floor-tables-view";
import { useFloor } from "../features/floor/use-floor";
import { newId } from "../features/ids/new-id";
import type { OrderNumbers } from "../features/order/device-order-number";
import {
  type TableOrderOpening,
  openingForNewTable,
  openingFromStored,
} from "../features/table-order/table-order-opening";
import { readStoredOrder } from "../features/order/stored-order";
import { useOrderRefusal } from "../features/table-order/use-order-refusal";
import { useStaleDraftRedo } from "../features/table-order/use-stale-draft-redo";
import { refusalSentence, vi } from "../messages/vi";
import { FloorScreen } from "../screens/floor/floor-screen";
import { Alert } from "../screens/shared/screen-frame";
import type { SellingModesProps } from "./selling-modes";
import { TableOrdering } from "./table-ordering";

export interface TableServiceProps extends SellingModesProps {
  numbers: OrderNumbers;
  modeSwitch: ReactNode;
}

type Phase =
  { readonly kind: "floor" } | { readonly kind: "order"; readonly opening: TableOrderOpening };

/** Notes something done on the floor, shown there until the next table is opened. */
function Notice({ text, kind }: { text: string | null; kind: "ok" | "refused" }) {
  if (text === null) return null;
  if (kind === "refused") return <Alert message={text} />;
  return (
    <p className="pos-notice" role="status">
      {text}
    </p>
  );
}

/**
 * Serving at tables: the floor, then the order of the table tapped (a new one at a free
 * table, the one seated there otherwise), then back to the floor once it is left or paid.
 */
export function TableService(props: TableServiceProps) {
  const { client, menu, now, header, numbers } = props;
  const [phase, setPhase] = useState<Phase>({ kind: "floor" });
  const [notice, setNotice] = useState<string | null>(null);
  const preBilled = useRef(new Set<string>()).current;
  const recorded = useRef(new Set<string>()).current;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const floor = useFloor({
    client,
    loadFloor: props.loadFloor,
    onSyncPass: props.onSyncPass,
    preBilled,
  });
  const redo = useStaleDraftRedo(client, props.place, menu, recorded);
  const refusal = useOrderRefusal(client, null, recorded, redo.shows);
  const onRecorded = useCallback((commandId: string) => recorded.add(commandId), [recorded]);
  const openOrder = useRef<string | null>(null);
  openOrder.current = phase.kind === "order" ? phase.opening.order.orderId : null;

  // The order open on screen was saved again over another till's change: it opens afresh
  // from the till's copy, answering for the redo.
  useEffect(() => {
    const done = redo.redone;
    if (done === null || openOrder.current !== done.orderId) return;
    client
      .snapshot("order", done.orderId)
      .then((view) => {
        const stored = view === null ? null : readStoredOrder(view.snapshot);
        if (stored === null || openOrder.current !== done.orderId) return;
        const copy = view?.source === "optimistic" ? { ...stored, heldOnTill: true } : stored;
        const opening = { ...openingFromStored(menu, copy), answersFor: [done.commandId] };
        setPhase({ kind: "order", opening });
      })
      .catch(console.error);
  }, [client, menu, redo.redone]);

  async function open(table: FloorTableView) {
    setNotice(null);
    setDismissed(refusal?.commandId ?? null);
    if (table.orderId === null) {
      const number = await numbers.next();
      const seat = { id: table.id, name: table.name };
      setPhase({
        kind: "order",
        opening: openingForNewTable(newId(), number, seat, menu.config.chargeProfile),
      });
      return;
    }
    const stored = floor.orders.get(table.orderId);
    try {
      if (stored === undefined || stored.status !== "draft") throw new Error("not on the till");
      setPhase({ kind: "order", opening: openingFromStored(menu, stored) });
    } catch {
      setNotice(vi.tables.floor.orderNotOnTill);
    }
  }

  if (phase.kind === "order") {
    return (
      <TableOrdering
        {...props}
        key={`${phase.opening.order.orderId}:${phase.opening.answersFor?.join() ?? ""}`}
        opening={phase.opening}
        areas={floor.occupancy?.areas ?? []}
        tables={floor.tables}
        preBilled={preBilled}
        onRecorded={onRecorded}
        onLeave={(said) => {
          setNotice(said);
          setPhase({ kind: "floor" });
        }}
      />
    );
  }
  const shownRefusal = refusal !== null && refusal.commandId !== dismissed ? refusal : null;
  return (
    <FloorScreen
      header={
        <>
          {header}
          {props.modeSwitch}
        </>
      }
      areas={floor.occupancy?.areas ?? null}
      tables={floor.tables}
      now={now}
      loadError={floor.loadError}
      notice={
        <>
          <Notice text={notice} kind="ok" />
          <Notice
            text={
              shownRefusal === null ? null : refusalSentence(shownRefusal.type, shownRefusal.code)
            }
            kind="refused"
          />
        </>
      }
      onOpenTable={(table) => void open(table).catch(console.error)}
    />
  );
}
