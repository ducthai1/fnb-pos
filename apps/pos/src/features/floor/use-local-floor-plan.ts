import type { PosFloorPlan } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import type { FloorOccupancy } from "./floor-occupancy";
import {
  type FloorCopies,
  NO_FLOOR_COPIES,
  floorKey,
  floorPlanOf,
  isFloorEntity,
  readFloorCopies,
} from "./floor-plan-copies";

interface HeldCopies {
  readonly copies: FloorCopies;
  readonly removed: ReadonlySet<string>;
}

/**
 * The floor plan from the bootstrap and every area or table change pulled since, read again
 * whenever a pass changes one; null when the server sent no plan (the floor then reads it
 * from the network). A changed row that then shows nothing was removed by the feed.
 */
export function useLocalFloorPlan(
  client: Pick<SyncClient, "snapshots" | "onChange">,
  base: PosFloorPlan | undefined,
): FloorOccupancy | null {
  const [held, setHeld] = useState<HeldCopies>({ copies: NO_FLOOR_COPIES, removed: new Set() });
  useEffect(() => {
    if (base === undefined) return;
    let live = true;
    const removed = new Set<string>();
    // One read at a time, in the order the changes came: a later pass never shows first.
    let reading: Promise<void> = Promise.resolve();
    const refresh = (changed: readonly string[]) => {
      reading = reading
        .then(async () => {
          const copies = await readFloorCopies(client);
          for (const key of changed) {
            if (copies.shown.has(key)) removed.delete(key);
            else removed.add(key);
          }
          if (live) setHeld({ copies, removed: new Set(removed) });
        })
        .catch(console.error);
    };
    const unsubscribe = client.onChange((changed) => {
      const rows = changed.filter((ref) => isFloorEntity(ref.entity));
      if (rows.length > 0) refresh(rows.map((ref) => floorKey(ref.entity, ref.entityId)));
    });
    refresh([]);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, base]);
  return useMemo(
    () => (base === undefined ? null : floorPlanOf(base, held.copies, held.removed)),
    [base, held],
  );
}
