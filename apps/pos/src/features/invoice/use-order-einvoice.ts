import { type OrderEInvoiceSnapshot, orderEInvoiceSnapshotSchema } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";

/** The invoice the order's row carries, once the server queued one; null until then. */
export function einvoiceOfOrder(snapshot: Record<string, unknown>): OrderEInvoiceSnapshot | null {
  const parsed = orderEInvoiceSnapshotSchema.safeParse(snapshot.einvoice);
  return parsed.success ? parsed.data : null;
}

/** A lookup the bill can print as text and as a QR: issued, with a code and a page for it. */
export function printableLookup(
  invoice: OrderEInvoiceSnapshot | null,
): { readonly code: string; readonly url: string } | null {
  if (invoice === null || invoice.status !== "issued") return null;
  const { lookupCode, lookupUrl } = invoice;
  if (lookupCode === null || lookupUrl === null) return null;
  // A receipt printer's QR takes plain ASCII only; a page it cannot encode is left off.
  return /^[\x21-\x7e]+$/.test(lookupUrl) ? { code: lookupCode, url: lookupUrl } : null;
}

/**
 * The order's invoice as the till's copy of the order shows it, read again on every change
 * to the order: the server sends the order out again once the provider issued the invoice.
 */
export function useOrderEInvoice(
  client: Pick<SyncClient, "snapshot" | "onChange">,
  orderId: string,
): OrderEInvoiceSnapshot | null {
  const [invoice, setInvoice] = useState<OrderEInvoiceSnapshot | null>(null);
  useEffect(() => {
    let live = true;
    const read = async () => {
      const view = await client.snapshot("order", orderId);
      if (live) setInvoice(view === null ? null : einvoiceOfOrder(view.snapshot));
    };
    const unsubscribe = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order" && ref.entityId === orderId)) {
        read().catch(console.error);
      }
    });
    read().catch(console.error);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, orderId]);
  return invoice;
}
