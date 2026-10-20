import type { SyncClient } from "@fnb/sync-client";
import { type StoredOrder, readStoredOrder } from "./stored-order";

/** The server's copy of the order if none of the till's commands on it waits now; else null. */
export async function serverCopyNow(
  client: Pick<SyncClient, "snapshot">,
  orderId: string,
): Promise<StoredOrder | null> {
  const view = await client.snapshot("order", orderId);
  return view?.source === "server" ? readStoredOrder(view.snapshot) : null;
}

/**
 * The server's copy of the order once none of the till's commands on it waits any more (the
 * row is the server's), or null after `waitMs`: offline, the till goes on with its own.
 */
export function serverCopyOf(
  client: Pick<SyncClient, "snapshot" | "onChange">,
  orderId: string,
  waitMs: number,
): Promise<StoredOrder | null> {
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe = () => {};
    const finish = (found: StoredOrder | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(found);
    };
    const check = async () => {
      const stored = await serverCopyNow(client, orderId);
      if (stored !== null) finish(stored);
    };
    const timer = setTimeout(() => finish(null), waitMs);
    unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order" && ref.entityId === orderId)) {
        check().catch(() => finish(null));
      }
    });
    check().catch(() => finish(null));
  });
}
