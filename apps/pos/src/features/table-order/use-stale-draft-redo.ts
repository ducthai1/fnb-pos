import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import { serverCopyOf } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import { isStaleDraft, redoDraftCommand, redoneCart } from "./redo-stale-draft";

/** How long a redo waits for the till's other commands on the order to be answered. */
const REDO_WAIT_MS = 60_000;

/** The till saved its refused drafts again over the order another till changed. */
export interface DraftRedone {
  readonly orderId: string;
  readonly commandId: string;
}

type RedoClient = Pick<SyncClient, "rejectedCommands" | "onChange" | "snapshot" | "enqueue">;

/**
 * Drafts of the till's tables that the server refused because another till changed the
 * order first are saved again, once, over the order as the server holds it then: once none
 * of the till's commands on it waits, so the redo knows every answer and the server's latest
 * copy. Runs for the whole floor, so a waiter who went back to the floor loses nothing
 * either. A redo the server refuses too is not redone: it shows as a refusal like any other.
 */
export function useStaleDraftRedo(
  client: RedoClient,
  place: TillPlace,
  menu: TillMenu,
  /** The commands the till's table screens recorded; redos are added to it. */
  recorded: Set<string>,
) {
  const taken = useRef(new Set<string>()).current;
  const redos = useRef(new Set<string>()).current;
  const busy = useRef(new Set<string>()).current;
  const [redone, setRedone] = useState<DraftRedone | null>(null);
  const live = useRef({ place, menu });
  live.current = { place, menu };

  useEffect(() => {
    let mounted = true;
    const waiting = (refused: RejectedCommand) =>
      recorded.has(refused.command.commandId) &&
      isStaleDraft(refused) &&
      !redos.has(refused.command.commandId) &&
      !taken.has(refused.command.commandId);

    async function redo(orderId: string) {
      const latest = await serverCopyOf(client, orderId, REDO_WAIT_MS);
      if (latest === null || !mounted) return;
      const refused = (await client.rejectedCommands()).filter(
        (entry) => entry.entityId === orderId && waiting(entry),
      );
      for (const entry of refused) taken.add(entry.command.commandId);
      // Paid or cancelled at another till meanwhile: nothing is left to add to.
      if (refused.length === 0 || latest.status !== "draft") return;
      const { place: at, menu: now } = live.current;
      const cart = redoneCart(now, latest, refused);
      if (cart === null) return;
      const command = redoDraftCommand(at, now, latest, cart, Date.now());
      recorded.add(command.commandId);
      redos.add(command.commandId);
      await client.enqueue(command);
      if (mounted) setRedone({ orderId, commandId: command.commandId });
    }

    async function look() {
      const orders = new Set(
        (await client.rejectedCommands()).filter(waiting).map((entry) => entry.entityId),
      );
      for (const orderId of orders) {
        if (busy.has(orderId)) continue;
        busy.add(orderId);
        redo(orderId)
          .catch(console.error)
          .finally(() => busy.delete(orderId));
      }
    }

    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order")) look().catch(console.error);
    });
    look().catch(console.error);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [client, recorded, taken, redos, busy]);

  /** Whether a refusal is the cashier's to read: a stale draft is redone, not shown. */
  const shows = useMemo(
    () => (refused: RejectedCommand) =>
      !isStaleDraft(refused) || redos.has(refused.command.commandId),
    [redos],
  );
  return { redone, shows };
}
