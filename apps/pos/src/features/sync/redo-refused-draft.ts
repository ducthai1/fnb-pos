import type { LocalCommand, RejectedCommand, SyncClient } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import { serverCopyNow } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import { redoDraftCommands, redoneCart, refusedTickets } from "../table-order/redo-stale-draft";

/**
 * What saving a refused draft again over the order as the server holds it came to: saved
 * again; nothing to add (the server already has every item); the order was paid or cancelled
 * at another till so there is no draft to add to; or the till has no server copy to go on.
 */
export type RedoOutcome = "sent" | "nothing_to_add" | "not_a_draft" | "no_server_copy";

/**
 * Saves the items of a draft the server refused (another till changed the order first)
 * again, over the server's newer copy: every item the server holds, plus what this till's
 * draft added that the server lacks. The refusal is left to the caller to take off the list.
 */
export async function redoRefusedDraft(
  client: Pick<SyncClient, "snapshot" | "enqueue" | "rejectedCommands" | "resolveRejected">,
  place: TillPlace,
  menu: TillMenu,
  refused: RejectedCommand,
  at: number,
): Promise<RedoOutcome> {
  const latest = await serverCopyNow(client, refused.entityId);
  if (latest === null) return "no_server_copy";
  if (latest.status !== "draft") return "not_a_draft";
  const cart = redoneCart(menu, latest, [refused]);
  if (cart === null) return "nothing_to_add";
  // Tickets the stations hold for these items, refused because the server did not have them.
  const tickets = await refusedTickets(client, refused.entityId, cart);
  const commands: LocalCommand[] = redoDraftCommands(
    place,
    menu,
    latest,
    cart,
    tickets.map((entry) => entry.ticket),
    at,
  );
  for (const command of commands) await client.enqueue(command);
  for (const entry of tickets) await client.resolveRejected(entry.commandId);
  return "sent";
}
