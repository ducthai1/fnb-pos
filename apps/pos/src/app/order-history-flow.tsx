import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useMemo, useState } from "react";
import {
  type HistoryEntry,
  type HistoryFilter,
  filterHistory,
  orderHistory,
} from "../features/history/order-history";
import { reprintStoredSale } from "../features/history/reprint-from-history";
import { useOrderViews } from "../features/history/use-order-views";
import type { TillMenu } from "../features/menu/till-menu";
import type { OrderNumbers } from "../features/order/device-order-number";
import type { StoredOrder } from "../features/order/stored-order";
import { type TillPlace, businessDateAt } from "../features/order/till-command";
import type { PrintedSlip } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { vi } from "../messages/vi";
import { OrderHistoryScreen } from "../screens/history/order-history-screen";
import { RoundSlipsScreen } from "../screens/table-order/round-slips-screen";
import { RefundFlow } from "./refund-flow";

export interface OrderHistoryFlowProps {
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  header: ReactNode;
  printer: PrinterPort;
  numbers: OrderNumbers;
  shiftId: string;
  cashierName: string;
  /** A counter draft back on the counter. */
  onReopenCounter(order: StoredOrder): void;
  /** A table's draft is opened from its table. */
  onReopenTables(): void;
  onBack(): void;
}

type Step =
  | { readonly kind: "list" }
  | { readonly kind: "refund"; readonly entry: HistoryEntry }
  | { readonly kind: "reprint"; readonly slips: readonly PrintedSlip[] | null };

/** The day's orders from the till's own copies, with what can be done to each. */
export function OrderHistoryFlow(props: OrderHistoryFlowProps) {
  const { client, place } = props;
  const views = useOrderViews(client);
  const day = businessDateAt(place, Date.now());
  const entries = useMemo(() => orderHistory(views, day, place.deviceId), [views, day, place]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<Step>({ kind: "list" });
  const list = () => setStep({ kind: "list" });

  if (step.kind === "refund") {
    // The entry as it stands now, so a refund made a moment ago counts.
    const entry = entries.find((one) => one.order.orderId === step.entry.order.orderId);
    return <RefundFlow {...props} entry={entry ?? step.entry} onBack={list} />;
  }
  if (step.kind === "reprint") {
    return (
      <RoundSlipsScreen
        header={props.header}
        title={vi.history.reprintTitle}
        slips={step.slips}
        backLabel={vi.refund.backToHistory}
        onBack={list}
      />
    );
  }
  return (
    <OrderHistoryScreen
      header={props.header}
      day={day}
      entries={filterHistory(entries, filter, search)}
      filter={filter}
      search={search}
      onFilter={setFilter}
      onSearch={setSearch}
      onReopen={(entry) =>
        entry.order.tableId === null ? props.onReopenCounter(entry.order) : props.onReopenTables()
      }
      onRefund={(entry) => setStep({ kind: "refund", entry })}
      onReprint={(entry) => {
        setStep({ kind: "reprint", slips: null });
        const view = views.find((one) => one.entityId === entry.order.orderId);
        reprintStoredSale({ ...props, stored: entry.order, view }).then(
          (slip) => setStep({ kind: "reprint", slips: [slip] }),
          (error: unknown) => {
            console.error(error);
            setStep({ kind: "reprint", slips: [] });
          },
        );
      }}
      onBack={props.onBack}
    />
  );
}
