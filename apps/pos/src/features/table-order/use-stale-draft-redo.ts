import type { RejectedCommand } from "@fnb/sync-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import type { TillPlace } from "../order/till-command";
import { handedOverTicket, isStaleDraft } from "./redo-stale-draft";
import {
  type DraftRedone,
  type RedoClient,
  newRedoMemory,
  redoStaleOrder,
  waitingForRedo,
} from "./redo-stale-order";

/** How long a redo waits for the till's other commands on the order to be answered. */
const REDO_WAIT_MS = 60_000;

export type { DraftRedone } from "./redo-stale-order";

/**
 * Drafts of the till's tables that the server refused because another till changed the
 * order first are saved again, once, over the order as the server holds it then (see
 * redoStaleOrder). Runs for the whole floor, so a waiter who went back to the floor loses
 * nothing either. A redo the server refuses too is not redone: it shows as a refusal like
 * any other.
 */
export function useStaleDraftRedo(
  client: RedoClient,
  place: TillPlace,
  menu: TillMenu,
  /** The commands the till's table screens recorded; redos are added to it. */
  recorded: Set<string>,
) {
  const memory = useRef(newRedoMemory()).current;
  const { taken, redos, recordedAgain } = memory;
  const busy = useRef(new Set<string>()).current;
  const [redone, setRedone] = useState<DraftRedone | null>(null);
  const live = useRef({ place, menu });
  live.current = { place, menu };

  useEffect(() => {
    let mounted = true;

    async function redo(orderId: string) {
      const { place: at, menu: now } = live.current;
      const done = await redoStaleOrder({
        client,
        place: at,
        menu: now,
        orderId,
        recorded,
        memory,
        waitMs: REDO_WAIT_MS,
        now: Date.now,
        alive: () => mounted,
      });
      if (done !== null && mounted) setRedone(done);
    }

    async function look() {
      const orders = new Set(
        (await client.rejectedCommands())
          .filter((entry) => waitingForRedo(entry, recorded, memory))
          .map((entry) => entry.entityId),
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
  }, [client, recorded, memory, busy]);

  /**
   * Whether a refusal is the cashier's to read: a stale draft is redone, not shown; nor is
   * the refusal of a ticket recorded over it, which the redo records again.
   */
  const shows = useMemo(
    () => (refused: RejectedCommand, all: readonly RejectedCommand[]) => {
      if (isStaleDraft(refused)) return redos.has(refused.command.commandId);
      if (handedOverTicket(refused) === null) return true;
      if (recordedAgain.has(refused.command.commandId)) return false;
      // Held back while the redo is due or running; once it found nothing to add the items
      // to, the refusal is the cashier's to read after all.
      if (busy.has(refused.entityId)) return false;
      return !all.some(
        (entry) =>
          entry.entityId === refused.entityId &&
          isStaleDraft(entry) &&
          !taken.has(entry.command.commandId),
      );
    },
    [redos, recordedAgain, busy, taken],
  );
  return { redone, shows };
}
