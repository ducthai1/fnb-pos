import type { EntityView, SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

/** Every order row the till holds, read again whenever one changes. */
export function useOrderViews(client: Pick<SyncClient, "snapshots" | "onChange">) {
  const [views, setViews] = useState<readonly EntityView[]>([]);
  useEffect(() => {
    let live = true;
    const read = () =>
      client.snapshots("order").then((found) => {
        if (live) setViews(found);
      }, console.error);
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order")) void read();
    });
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client]);
  return views;
}
