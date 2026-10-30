import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import { serverCopyOf } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import {
  isStaleDraft,
  redoDraftCommands,
  redoneCart,
  refusedTickets,
} from "./redo-stale-draft";

export type RedoClient = Pick<
  SyncClient,
  "rejectedCommands" | "onChange" | "snapshot" | "enqueue" | "resolveRejected"
>;

/** What a till remembers of the refusals it has already dealt with. */
export interface RedoMemory {
  /** Refused drafts whose order was looked at (redone, or nothing to add to). */
  readonly taken: Set<string>;
  /** The drafts the redo itself saved. */
  readonly redos: Set<string>;
  /** Tickets whose recording was refused and has been queued again after a redo. */
  readonly recordedAgain: Set<string>;
}

export const newRedoMemory = (): RedoMemory => ({
  taken: new Set(),
  redos: new Set(),
  recordedAgain: new Set(),
});

/** A refused draft this till recorded and has not dealt with yet. */
export const waitingForRedo = (
  refused: RejectedCommand,
  recorded: ReadonlySet<string>,
  memory: RedoMemory,
): boolean =>
  recorded.has(refused.command.commandId) &&
  isStaleDraft(refused) &&
  !memory.redos.has(refused.command.commandId) &&
  !memory.taken.has(refused.command.commandId);

/** The till saved its refused drafts again over the order another till changed. */
export interface DraftRedone {
  readonly orderId: string;
  readonly commandId: string;
}

/**
 * Saves a table's refused drafts again, once, over the order as the server holds it now:
 * waits (up to `waitMs`) until none of the till's commands on the order waits, so the redo
 * knows every answer. Records the tickets the stations already hold for the redone items
 * behind it, and takes the refusals it answers off the till's list. Null: nothing was redone
 * (the server's copy is not here yet, the order was paid or cancelled elsewhere, or there is
 * nothing to add).
 */
export async function redoStaleOrder(input: {
  readonly client: RedoClient;
  readonly place: TillPlace;
  readonly menu: TillMenu;
  readonly orderId: string;
  /** The commands the till's table screens recorded; redos are added to it. */
  readonly recorded: Set<string>;
  readonly memory: RedoMemory;
  readonly waitMs: number;
  /** The time the redo's commands are stamped with. */
  now(): number;
  /** False once the screen that asked has gone away: nothing is changed then. */
  alive?(): boolean;
}): Promise<DraftRedone | null> {
  const { client, orderId, recorded, memory } = input;
  const alive = input.alive ?? (() => true);
  const latest = await serverCopyOf(client, orderId, input.waitMs);
  if (latest === null || !alive()) return null;
  const refused = (await client.rejectedCommands()).filter(
    (entry) => entry.entityId === orderId && waitingForRedo(entry, recorded, memory),
  );
  for (const entry of refused) memory.taken.add(entry.command.commandId);
  // Paid or cancelled at another till meanwhile: nothing is left to add to.
  if (refused.length === 0 || latest.status !== "draft") return null;
  const cart = redoneCart(input.menu, latest, refused);
  if (cart === null) return null;
  const tickets = await refusedTickets(
    client,
    orderId,
    cart,
    (id) => recorded.has(id) && !memory.recordedAgain.has(id),
  );
  for (const entry of tickets) memory.recordedAgain.add(entry.commandId);
  const [draft, ...records] = redoDraftCommands(
    input.place,
    input.menu,
    latest,
    cart,
    tickets.map((entry) => entry.ticket),
    input.now(),
  );
  if (draft === undefined) return null;
  recorded.add(draft.commandId);
  memory.redos.add(draft.commandId);
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
  return { orderId, commandId: draft.commandId };
}
