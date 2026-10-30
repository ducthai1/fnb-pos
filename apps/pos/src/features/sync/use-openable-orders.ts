import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { orderIdOfRejected } from "../payment/use-settled-qr-closing";

const NONE: ReadonlySet<string> = new Set();

/**
 * The orders the refused commands are about that are still drafts on the till: each can be
 * opened to be fixed, or to ask for the approval the server wanted and send the command again.
 */
export function useOpenableOrders(
  client: Pick<SyncClient, "snapshot" | "onChange"> | null,
  rejected: readonly RejectedCommand[],
): ReadonlySet<string> {
  const [found, setFound] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    if (client === null) return;
    let live = true;
    const ids = new Set<string>();
    for (const entry of rejected) {
      const id = orderIdOfRejected(entry);
      if (id !== null) ids.add(id);
    }
    const read = async () => {
      const open = new Set<string>();
      for (const id of ids) {
        const view = await client.snapshot("order", id);
        if (view?.snapshot.status === "draft") open.add(id);
      }
      if (live) setFound(open);
    };
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order" && ids.has(ref.entityId))) {
        read().catch(console.error);
      }
    });
    read().catch(console.error);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, rejected]);
  return found;
}
