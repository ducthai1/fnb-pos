import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

const APPROVAL_REQUIRED = "SYNC_APPROVAL_REQUIRED";

/**
 * Whether the server refused to close this shift for want of a manager: it found a
 * difference beyond the tolerance that the till's own book did not show. The next close
 * then asks a manager whatever the till counts.
 */
export function useCloseRefused(
  client: Pick<SyncClient, "rejectedCommands" | "onChange">,
  shiftId: string,
): boolean {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let live = true;
    const read = () =>
      client.rejectedCommands().then((all) => {
        const found = all.some(
          (entry) =>
            entry.command.type === "shift.close" &&
            entry.entityId === shiftId &&
            entry.code === APPROVAL_REQUIRED,
        );
        if (live) setRefused(found);
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
  return refused;
}
