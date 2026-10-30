import type { LocalCommand, RejectedCommand, SyncClient } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import { serverCopyNow } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import { redoDraftCommand, redoneCart } from "../table-order/redo-stale-draft";

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
  client: Pick<SyncClient, "snapshot" | "enqueue">,
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
  const command: LocalCommand = redoDraftCommand(place, menu, latest, cart, at);
  await client.enqueue(command);
  return "sent";
}
