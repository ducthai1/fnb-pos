import { type Vnd, vnd } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

const APPROVAL_REQUIRED = "SYNC_APPROVAL_REQUIRED";

/**
 * The count the server last refused to close this shift on for want of a manager, or null:
 * it found a difference beyond the tolerance there. The close screen then shows the
 * difference the server's figures give that count, and the next close asks a manager
 * whatever the till counts.
 */
export function useCloseRefused(
  client: Pick<SyncClient, "rejectedCommands" | "onChange">,
  shiftId: string,
): Vnd | null {
  const [refused, setRefused] = useState<Vnd | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      client.rejectedCommands().then((all) => {
        const found = all.filter(
          (entry) =>
            entry.command.type === "shift.close" &&
            entry.entityId === shiftId &&
            entry.code === APPROVAL_REQUIRED,
        );
        const counted = (found.at(-1)?.command.payload as { counted?: unknown } | undefined)
          ?.counted;
        if (live) setRefused(typeof counted === "number" ? vnd(counted) : null);
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
