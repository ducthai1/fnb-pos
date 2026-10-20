import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { type StoredShift, readStoredShift } from "./stored-shift";

/** The shift `shiftId` as the till's copy shows it, read again whenever a shift row changes. */
export function useStoredShift(
  client: Pick<SyncClient, "snapshot" | "onChange">,
  shiftId: string,
): StoredShift | null {
  const [shift, setShift] = useState<StoredShift | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      client.snapshot("shift", shiftId).then((view) => {
        if (live) setShift(view === null ? null : readStoredShift(view.snapshot));
      }, console.error);
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "shift")) void read();
    });
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, shiftId]);
  return shift;
}
