import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useState } from "react";
import type { TillPlace } from "../features/order/till-command";
import { useSettledQrClosing } from "../features/payment/use-settled-qr-closing";
import { openShiftCommand } from "../features/shift/till-shift";
import { useTillShift } from "../features/shift/use-till-shift";
import { vi } from "../messages/vi";
import { NeedsAttentionScreen } from "../screens/needs-attention/needs-attention-screen";
import { OpenShiftScreen } from "../screens/open-shift/open-shift-screen";

export interface NeedsAttentionFlowProps {
  client: SyncClient | null;
  place: TillPlace | null;
  /** Who is signed in: the shift opened here is theirs. */
  staffId: string;
  rejected: readonly RejectedCommand[];
  /** A command went into the outbox, worth pushing now. */
  onSent(): void;
  onBack(): void;
}

/**
 * The needs-attention list with what can be settled on the spot. A paid QR closes its order
 * into the till's open shift. With none open (the cashier closed it, or the till restarted
 * before the next was opened) the shift is opened first, on the float counted as at the start
 * of any shift, and the order closed straight after: its money lands in a drawer and a shift
 * report like every other sale, which the server insists on.
 */
export function NeedsAttentionFlow(props: NeedsAttentionFlowProps) {
  const { client, place, onSent } = props;
  const settledQr = useSettledQrClosing(client, place, props.rejected);
  const shift = useTillShift(client, place?.deviceId ?? "");
  /** The order waiting for the shift the cashier is opening for it. */
  const [opening, setOpening] = useState<string | null>(null);

  const close = (orderId: string) =>
    settledQr.close(orderId).then((outcome) => {
      if (outcome === "needs_shift") setOpening(orderId);
      if (outcome === "sent") onSent();
    }, console.error);

  if (opening !== null && client !== null && place !== null) {
    return (
      <OpenShiftScreen
        header={
          <>
            <p className="pos-hint">{vi.needsAttention.openShiftFirst}</p>
            <button type="button" className="pos-button" onClick={() => setOpening(null)}>
              {vi.needsAttention.backToList}
            </button>
          </>
        }
        onOpen={async (counts) => {
          await client.enqueue(openShiftCommand(place, props.staffId, counts, Date.now()));
          // Back to the list first: the shift is open whatever the close then comes to, and
          // a second tap must not open another.
          setOpening(null);
          await close(opening);
        }}
      />
    );
  }
  return (
    <NeedsAttentionScreen
      rejected={props.rejected}
      closable={settledQr.closable}
      closeNeedsShift={shift.loaded && shift.shift === null}
      onCloseWithSettledQr={(orderId) => void close(orderId)}
      onBack={props.onBack}
    />
  );
}
