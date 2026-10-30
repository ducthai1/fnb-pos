import type { ShiftCashEvent, ShiftCashLedger } from "@fnb/domain";
import type { AcceptedShiftCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import { heldShiftCash, tillShiftLedger, waitingShiftCash } from "./shift-cash";
import type { StoredShift } from "./stored-shift";
import { useStoredShift } from "./use-stored-shift";

type Client = Pick<
  SyncClient,
  "snapshot" | "pendingCommands" | "acceptedShiftCommands" | "onChange"
>;

/**
 * The till's cash the shift's copy does not hold yet, read again on every write: what still
 * waits for the server's answer, and what the server took but its copy of the shift has not
 * caught up with (see heldShiftCash). Null until first read.
 */
function useCashOutsideTheCopy(
  client: Client,
  shiftId: string,
): {
  readonly waiting: readonly ShiftCashEvent[];
  readonly accepted: readonly AcceptedShiftCommand[];
} | null {
  const [state, setState] = useState<{
    waiting: readonly ShiftCashEvent[];
    accepted: readonly AcceptedShiftCommand[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      Promise.all([client.pendingCommands(), client.acceptedShiftCommands()]).then(
        ([pending, accepted]) => {
          if (live) setState({ waiting: waitingShiftCash(pending, shiftId), accepted });
        },
        console.error,
      );
    // An answered command changes its own row, never the shift: listen to every write.
    const unsubscribe = client.onChange(() => void read());
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, shiftId]);
  return state;
}

/** The till's open shift and the cash book it is counted against, kept current. */
export function useShiftLedger(
  client: Client,
  shiftId: string,
): { readonly shift: StoredShift; readonly ledger: ShiftCashLedger } | null {
  const shift = useStoredShift(client, shiftId);
  const outside = useCashOutsideTheCopy(client, shiftId);
  return useMemo(() => {
    if (shift === null || outside === null) return null;
    const held = heldShiftCash(outside.accepted, shift);
    return { shift, ledger: tillShiftLedger(shift, [...outside.waiting, ...held]) };
  }, [shift, outside]);
}
