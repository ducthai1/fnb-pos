import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import type { BootstrapSnapshot } from "../bootstrap/bootstrap-source";
import { isMenuEntity, readMenuCopies } from "./read-menu-copies";
import {
  type MenuCopies,
  NO_MENU_COPIES,
  type TillMenu,
  buildTillMenu,
  removedKey,
} from "./till-menu";

interface HeldCopies {
  readonly copies: MenuCopies;
  readonly removed: ReadonlySet<string>;
}

/**
 * The menu from the bootstrap and every menu change the sync loop has pulled since, read
 * again whenever a pass changes a menu row. A row the feed deleted reads back as nothing,
 * the same as a row never pulled, so a changed row that then shows nothing is noted as
 * removed; the bootstrap is loaded afresh on every start and holds no row deleted before it.
 */
export function useTillMenu(bootstrap: BootstrapSnapshot, client: SyncClient | null): TillMenu {
  const [held, setHeld] = useState<HeldCopies>({ copies: NO_MENU_COPIES, removed: new Set() });
  useEffect(() => {
    if (client === null) return;
    let live = true;
    const removed = new Set<string>();
    // One read at a time, in the order the changes came: a later pass never shows first.
    let reading: Promise<void> = Promise.resolve();
    const refresh = (changed: readonly string[]) => {
      reading = reading
        .then(async () => {
          const read = await readMenuCopies(client);
          for (const key of changed) {
            if (read.shown.has(key)) removed.delete(key);
            else removed.add(key);
          }
          if (live) setHeld({ copies: read.copies, removed: new Set(removed) });
        })
        .catch(console.error);
    };
    const unsubscribe = client.onChange((changed) => {
      const menuRows = changed.filter((ref) => isMenuEntity(ref.entity));
      if (menuRows.length > 0) refresh(menuRows.map((ref) => removedKey(ref.entity, ref.entityId)));
    });
    refresh([]);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client]);
  return useMemo(() => buildTillMenu(bootstrap, held.copies, held.removed), [bootstrap, held]);
}
