import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import { serverCopyOf } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import {
  handedOverTicket,
  isStaleDraft,
  redoDraftCommands,
  redoneCart,
  refusedTickets,
} from "./redo-stale-draft";

/** How long a redo waits for the till's other commands on the order to be answered. */
const REDO_WAIT_MS = 60_000;

/** The till saved its refused drafts again over the order another till changed. */
export interface DraftRedone {
  readonly orderId: string;
  readonly commandId: string;
}

type RedoClient = Pick<
  SyncClient,
  "rejectedCommands" | "onChange" | "snapshot" | "enqueue" | "resolveRejected"
>;

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
  /** Tickets whose recording was refused and has been queued again after the redo. */
  const recordedAgain = useRef(new Set<string>()).current;
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
      const tickets = await refusedTickets(
        client,
        orderId,
        cart,
        (id) => recorded.has(id) && !recordedAgain.has(id),
      );
      for (const entry of tickets) recordedAgain.add(entry.commandId);
      const [draft, ...records] = redoDraftCommands(
        at,
        now,
        latest,
        cart,
        tickets.map((entry) => entry.ticket),
        Date.now(),
      );
      if (draft === undefined) return;
      recorded.add(draft.commandId);
      redos.add(draft.commandId);
      await client.enqueue(draft);
      for (const record of records) {
        recorded.add(record.commandId);
        await client.enqueue(record);
      }
      // The redo stands in for the refusals it answers: they are off the till's list.
      for (const entry of [
        ...refused.map((one) => one.command.commandId),
        ...tickets.map((one) => one.commandId),
      ]) {
        await client.resolveRejected(entry);
      }
      if (mounted) setRedone({ orderId, commandId: draft.commandId });
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
