import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

export interface OrderRefusal {
  readonly commandId: string;
  readonly type: string;
  readonly code: string;
}

/** Which refusals a screen tells the cashier of; every one by default. */
type Shows = (refused: RejectedCommand, all: readonly RejectedCommand[]) => boolean;
const EVERY_REFUSAL: Shows = () => true;

/** The latest refusal of the commands in `ours`, among those the server refused for good. */
export async function refusalAmong(
  client: Pick<SyncClient, "rejectedCommands">,
  ours: ReadonlySet<string>,
  shows: Shows = EVERY_REFUSAL,
): Promise<OrderRefusal | null> {
  const all = await client.rejectedCommands();
  const refused = all
    .filter((entry) => ours.has(entry.command.commandId) && shows(entry, all))
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
  shows: Shows = EVERY_REFUSAL,
): OrderRefusal | null {
  const [refusal, setRefusal] = useState<OrderRefusal | null>(null);
  useEffect(() => {
    let live = true;
    const look = () =>
      refusalAmong(client, ours, shows)
        .then((found) => {
          if (live && found !== null) setRefusal(found);
        })
        .catch(console.error);
    const unsubscribe = client.onChange((changed) => {
      const touched = changed.some(
        (ref) => ref.entity === "order" && (orderId === null || ref.entityId === orderId),
      );
      if (touched) void look();
    });
    // A screen opened answering for commands recorded before it may have missed their answer.
    if (ours.size > 0) void look();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, orderId, ours, shows]);
  return refusal;
}
