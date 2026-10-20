import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { type TillShift, unclosedShiftOf } from "./till-shift";

export type TillShiftState =
  { readonly loaded: false } | { readonly loaded: true; readonly shift: TillShift | null };

/** The till's open shift, read again whenever a shift row changes (opened here or synced). */
export function useTillShift(client: SyncClient | null, deviceId: string): TillShiftState {
  const [state, setState] = useState<TillShiftState>({ loaded: false });
  useEffect(() => {
    if (client === null) return;
    let live = true;
    const read = () =>
      unclosedShiftOf(client, deviceId).then((shift) => {
        if (live) setState({ loaded: true, shift });
      }, console.error);
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "shift")) void read();
    });
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, deviceId]);
  return state;
}
