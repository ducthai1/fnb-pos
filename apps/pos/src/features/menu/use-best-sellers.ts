import type { SyncClient } from "@fnb/sync-client";
import { createContext, useContext, useEffect, useState } from "react";
import { readStoredOrder } from "../order/stored-order";
import { bestSellers } from "./best-sellers";

const NONE: ReadonlySet<string> = new Set();

/** The best sellers, given to every menu drawn under the selling screens. */
export const BestSellersContext = createContext<ReadonlySet<string>>(NONE);

export const useBestSellerIds = (): ReadonlySet<string> => useContext(BestSellersContext);

/**
 * The till's best sellers, read from the orders it holds when the selling screens open and
 * again a while after its orders change: a mark that is a few seconds late costs nothing,
 * while reading every order on each tap of a busy counter would.
 */
export function useBestSellers(
  client: Pick<SyncClient, "snapshots" | "onChange">,
  settleMs = 20_000,
): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      timer = null;
      client.snapshots("order").then((views) => {
        if (!live) return;
        const orders = views.flatMap((view) => {
          const order = readStoredOrder(view.snapshot);
          return order === null ? [] : [order];
        });
        const next = bestSellers(orders);
        setIds((shown) =>
          shown.size === next.length && next.every((id) => shown.has(id)) ? shown : new Set(next),
        );
      }, console.error);
    };
    const unsubscribe = client.onChange((changed) => {
      if (timer === null && changed.some((ref) => ref.entity === "order")) {
        timer = setTimeout(read, settleMs);
      }
    });
    read();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [client, settleMs]);
  return ids;
}
