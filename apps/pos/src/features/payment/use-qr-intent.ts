import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import type { QrIntentState } from "./qr-intent-phase";
import { readIntentSnapshot } from "./settled-qr";

const NOTHING: QrIntentState = { intent: null, refusal: null };

/**
 * The QR's row as the till shows it (its own expectation until the server answers, then the
 * server's, then whatever the change feed brings: the bank's transfer, an expiry), and the
 * code the server refused its registration with. Read again on every change to that row.
 */
export function useQrIntent(
  client: Pick<SyncClient, "snapshot" | "rejectedCommands" | "onChange">,
  shown: { readonly intentId: string; readonly commandId: string } | null,
): QrIntentState {
  const [state, setState] = useState<QrIntentState>(NOTHING);
  useEffect(() => {
    setState(NOTHING);
    if (shown === null) return;
    let live = true;
    const read = async () => {
      const view = await client.snapshot(PAYMENT_INTENT_ENTITY, shown.intentId);
      const refused = (await client.rejectedCommands()).find(
        (entry) => entry.command.commandId === shown.commandId,
      );
      if (!live) return;
      setState({
        intent: view === null ? null : readIntentSnapshot(view.snapshot),
        refusal: refused?.code ?? null,
      });
    };
    const unsubscribe = client.onChange((changed) => {
      const ours = changed.some(
        (ref) => ref.entity === PAYMENT_INTENT_ENTITY && ref.entityId === shown.intentId,
      );
      if (ours) read().catch(console.error);
    });
    read().catch(console.error);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, shown]);
  return state;
}
