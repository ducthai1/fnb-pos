import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine } from "../order/counter-order";
import { readStoredOrder } from "../order/stored-order";
import { isStaleDraft, itemsMissedBy } from "../table-order/redo-stale-draft";
import { vi } from "../../messages/vi";

const NONE: ReadonlyMap<string, string> = new Map();

/** "2 × Trà đào", or the weight of a line sold by weight: "350 g Thịt bò". */
export function itemWords(menu: TillMenu, line: CartLine): string {
  const name = menu.productsById.get(line.productId)?.name ?? vi.needsAttention.unknownItem;
  return line.grams === undefined ? `${line.quantity} × ${name}` : `${line.grams} g ${name}`;
}

/**
 * What the cashier reads beside a save refused as stale whose order was paid or cancelled at
 * another till before it could be saved again: the items that missed the bill, by name, so
 * they are charged another way or set aside with a reason, never lost without a word.
 */
export function useMissedItemsNotes(
  client: Pick<SyncClient, "snapshot" | "onChange"> | null,
  menu: TillMenu,
  rejected: readonly RejectedCommand[],
): ReadonlyMap<string, string> {
  const [found, setFound] = useState<ReadonlyMap<string, string>>(NONE);
  useEffect(() => {
    if (client === null) return;
    let live = true;
    const stale = rejected.filter(isStaleDraft);
    const orders = new Set(stale.map((entry) => entry.entityId));
    const read = async () => {
      const notes = new Map<string, string>();
      for (const entry of stale) {
        const view = await client.snapshot("order", entry.entityId);
        const latest = view?.source === "server" ? readStoredOrder(view.snapshot) : null;
        if (latest === null || latest.status === "draft") continue;
        const missed = itemsMissedBy(menu, latest, entry);
        const words = missed.map((line) => itemWords(menu, line)).join(", ");
        const said = vi.needsAttention.notes.notDraft;
        notes.set(
          entry.command.commandId,
          missed.length === 0 ? said : `${said} ${vi.needsAttention.notes.missedItems(words)}`,
        );
      }
      if (live) setFound(notes);
    };
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order" && orders.has(ref.entityId))) {
        read().catch(console.error);
      }
    });
    read().catch(console.error);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, menu, rejected]);
  return found;
}
