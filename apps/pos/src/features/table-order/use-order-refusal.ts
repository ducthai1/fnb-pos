import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

export interface OrderRefusal {
  readonly commandId: string;
  readonly type: string;
  readonly code: string;
}

/** The latest refusal of the commands in `ours`, among those the server refused for good. */
export async function refusalAmong(
  client: Pick<SyncClient, "rejectedCommands">,
  ours: ReadonlySet<string>,
): Promise<OrderRefusal | null> {
  const refused = (await client.rejectedCommands())
    .filter((entry) => ours.has(entry.command.commandId))
    .at(-1);
  return refused === undefined
    ? null
    : { commandId: refused.command.commandId, type: refused.command.type, code: refused.code };
}

/**
 * The latest refusal of the commands a screen recorded, read again whenever the order's row
 * changes (a refusal settles the row with the server's copy); any order's when `orderId` is
 * null, as the floor reports on every table it acted on.
 */
export function useOrderRefusal(
  client: Pick<SyncClient, "rejectedCommands" | "onChange">,
  orderId: string | null,
  ours: ReadonlySet<string>,
): OrderRefusal | null {
  const [refusal, setRefusal] = useState<OrderRefusal | null>(null);
  useEffect(() => {
    let live = true;
    const unsubscribe = client.onChange((changed) => {
      const touched = changed.some(
        (ref) => ref.entity === "order" && (orderId === null || ref.entityId === orderId),
      );
      if (!touched) return;
      refusalAmong(client, ours)
        .then((found) => {
          if (live && found !== null) setRefusal(found);
        })
        .catch(console.error);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, orderId, ours]);
  return refusal;
}
