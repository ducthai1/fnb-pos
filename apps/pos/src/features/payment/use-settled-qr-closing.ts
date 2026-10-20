import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useEffect, useState } from "react";
import type { TillPlace } from "../order/till-command";
import { unclosedShiftOf } from "../shift/till-shift";
import { ORDER_HAS_SETTLED_QR, closeWithSettledQrCommand, paidQrOfOrder } from "./settled-qr";

/** The order a refused command was about: its row, or the order its payload names. */
export function orderIdOfRejected(entry: RejectedCommand): string | null {
  if (entry.entity === "order") return entry.entityId;
  const named = (entry.command.payload as { orderId?: unknown }).orderId;
  return typeof named === "string" ? named : null;
}

export interface SettledQrClosing {
  /** Orders still open on the till whose QR the bank paid: each can be closed with it now. */
  readonly closable: ReadonlySet<string>;
  close(orderId: string): Promise<void>;
}

async function closableOrders(client: SyncClient, rejected: readonly RejectedCommand[]) {
  const closable = new Set<string>();
  for (const entry of rejected) {
    const orderId = entry.code === ORDER_HAS_SETTLED_QR ? orderIdOfRejected(entry) : null;
    if (orderId === null || closable.has(orderId)) continue;
    const order = await client.snapshot("order", orderId);
    if (order?.snapshot.status !== "draft") continue;
    if ((await paidQrOfOrder(client, orderId)) !== null) closable.add(orderId);
  }
  return closable;
}

/**
 * For the "needs attention" list: orders the server would not let the till pay in cash or
 * cancel because a QR of theirs was paid, and closing each with that QR. Read again as the
 * orders and QRs change, so a closed order loses its button.
 */
export function useSettledQrClosing(
  client: SyncClient | null,
  place: TillPlace | null,
  rejected: readonly RejectedCommand[] | null,
): SettledQrClosing {
  const [closable, setClosable] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (client === null || rejected === null) return;
    let live = true;
    const read = () =>
      closableOrders(client, rejected).then((found) => {
        if (live) setClosable(found);
      }, console.error);
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order" || ref.entity === PAYMENT_INTENT_ENTITY))
        void read();
    });
    void read();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, rejected]);

  const close = useCallback(
    async (orderId: string) => {
      if (client === null || place === null) return;
      const order = await client.snapshot("order", orderId);
      const intent = await paidQrOfOrder(client, orderId);
      if (order === null || intent === null) return;
      const shift = await unclosedShiftOf(client, place.deviceId);
      await client.enqueue(
        closeWithSettledQrCommand(place, order.snapshot, intent, shift?.id ?? null, Date.now()),
      );
    },
    [client, place],
  );
  return { closable, close };
}
