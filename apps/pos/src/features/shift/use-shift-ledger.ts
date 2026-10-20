import type { ShiftCashEvent, ShiftCashLedger } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import { tillShiftLedger, waitingShiftCash } from "./shift-cash";
import type { StoredShift } from "./stored-shift";
import { useStoredShift } from "./use-stored-shift";

type Client = Pick<SyncClient, "snapshot" | "pendingCommands" | "onChange">;

/** The till's cash still waiting for the server under `shiftId`, read again on every write. */
function useWaitingShiftCash(client: Client, shiftId: string): readonly ShiftCashEvent[] | null {
  const [waiting, setWaiting] = useState<readonly ShiftCashEvent[] | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      client.pendingCommands().then((pending) => {
        if (live) setWaiting(waitingShiftCash(pending, shiftId));
      }, console.error);
    // An answered command changes its own row, never the shift: listen to every write.
    const unsubscribe = client.onChange(() => void read());
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, shiftId]);
  return waiting;
}

/** The till's open shift and the cash book it is counted against, kept current. */
export function useShiftLedger(
  client: Client,
  shiftId: string,
): { readonly shift: StoredShift; readonly ledger: ShiftCashLedger } | null {
  const shift = useStoredShift(client, shiftId);
  const waiting = useWaitingShiftCash(client, shiftId);
  return useMemo(() => {
    if (shift === null || waiting === null) return null;
    return { shift, ledger: tillShiftLedger(shift, waiting) };
  }, [shift, waiting]);
}
