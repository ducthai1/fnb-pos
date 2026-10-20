import type { ShiftCashLedger } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { useMemo } from "react";
import { useOrderViews } from "../history/use-order-views";
import { readStoredOrder } from "../order/stored-order";
import { tillShiftLedger } from "./shift-cash";
import type { StoredShift } from "./stored-shift";
import { useStoredShift } from "./use-stored-shift";

/** The till's open shift and the cash book the till rebuilds for it, kept current. */
export function useShiftLedger(
  client: Pick<SyncClient, "snapshot" | "snapshots" | "onChange">,
  shiftId: string,
  staffId: string,
): { readonly shift: StoredShift; readonly ledger: ShiftCashLedger } | null {
  const shift = useStoredShift(client, shiftId);
  const views = useOrderViews(client);
  return useMemo(() => {
    if (shift === null) return null;
    const orders = views.flatMap((view) => {
      const order = readStoredOrder(view.snapshot);
      return order === null ? [] : [order];
    });
    return { shift, ledger: tillShiftLedger(shift, orders, staffId) };
  }, [shift, views, staffId]);
}
