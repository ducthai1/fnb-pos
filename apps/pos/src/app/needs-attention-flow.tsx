import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import type { RejectedCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useMemo, useState } from "react";
import type { BootstrapSnapshot } from "../features/bootstrap/bootstrap-source";
import { useTillMenu } from "../features/menu/use-till-menu";
import { closeUnpaidTable } from "../features/order-adjust/cancel-order-command";
import type { ChosenReason } from "../features/order-adjust/reason-codes";
import type { TillPlace } from "../features/order/till-command";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { readStoredOrder } from "../features/order/stored-order";
import { readIntentSnapshot } from "../features/payment/settled-qr";
import { orderIdOfRejected } from "../features/payment/use-settled-qr-closing";
import { useSettledQrClosing } from "../features/payment/use-settled-qr-closing";
import { openShiftCommand } from "../features/shift/till-shift";
import { useTillShift } from "../features/shift/use-till-shift";
import { dismissRejectionCommand } from "../features/sync/dismiss-rejection-command";
import { type RedoOutcome, redoRefusedDraft } from "../features/sync/redo-refused-draft";
import {
  canRedo,
  dismissalNeedsApproval,
  dismissalNeedsWords,
  dismissalReasonsOf,
} from "../features/sync/rejection-routes";
import { useOpenableOrders } from "../features/sync/use-openable-orders";
import { vi } from "../messages/vi";
import { commandNameOf } from "../messages/vi-sync-errors";
import { DismissRejectionScreen } from "../screens/needs-attention/dismiss-rejection-screen";
import { NeedsAttentionScreen } from "../screens/needs-attention/needs-attention-screen";
import { OpenShiftScreen } from "../screens/open-shift/open-shift-screen";
import { approvalOf } from "./adjust-flow-parts";

export interface NeedsAttentionFlowProps {
  /** The till's bootstrap: the menu a refused draft is priced against when saved again. */
  snapshot: BootstrapSnapshot;
  client: SyncClient | null;
  place: TillPlace | null;
  /** Who is signed in: the shift opened here is theirs. */
  staffId: string;
  rejected: readonly RejectedCommand[];
  /** A command went into the outbox, worth pushing now. */
  onSent(): void;
  /** Leaves the list for the till with this order opened (a draft still on the till). */
  onOpenOrder(orderId: string): void;
  onBack(): void;
}

const NOTE_OF_OUTCOME: Readonly<Record<Exclude<RedoOutcome, "sent">, string>> = {
  nothing_to_add: vi.needsAttention.notes.nothingToAdd,
  not_a_draft: vi.needsAttention.notes.notDraft,
  no_server_copy: vi.needsAttention.notes.noCopy,
};

/**
 * The needs-attention list with what can be settled on the spot. A paid QR closes its order
 * into the till's open shift. With none open (the cashier closed it, or the till restarted
 * before the next was opened) the shift is opened first, on the float counted as at the start
 * of any shift, and the order closed straight after: its money lands in a drawer and a shift
 * report like every other sale, which the server insists on.
 */
export function NeedsAttentionFlow(props: NeedsAttentionFlowProps) {
  const { client, place, onSent } = props;
  const menu = useTillMenu(props.snapshot, client);
  const gate = useApprovalGate();
  /** Refusals dealt with in this visit; each is also off the till's list for good. */
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [notes, setNotes] = useState<ReadonlyMap<string, string>>(new Map());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [dismissing, setDismissing] = useState<RejectedCommand | null>(null);
  const rejected = useMemo(
    () => props.rejected.filter((entry) => !gone.has(entry.command.commandId)),
    [props.rejected, gone],
  );
  const openable = useOpenableOrders(client, rejected);
  const redoable = useMemo(
    () => new Set(rejected.filter(canRedo).map((entry) => entry.command.commandId)),
    [rejected],
  );
  const settle = useCallback(
    async (entry: RejectedCommand) => {
      if (client === null) return;
      await client.resolveRejected(entry.command.commandId);
      setGone((before) => new Set(before).add(entry.command.commandId));
    },
    [client],
  );
  const note = (id: string, text: string) => setNotes((before) => new Map(before).set(id, text));
  const redo = (entry: RejectedCommand) => {
    if (client === null || place === null) return;
    const id = entry.command.commandId;
    setBusy((before) => new Set(before).add(id));
    redoRefusedDraft(client, place, menu, entry, Date.now())
      .then(async (outcome) => {
        // Saved again, or the server already has every item: the refusal is dealt with.
        if (outcome === "sent" || outcome === "nothing_to_add") await settle(entry);
        if (outcome === "sent") onSent();
        else note(id, NOTE_OF_OUTCOME[outcome]);
      })
      .catch((error: unknown) => {
        console.error(error);
        note(id, vi.needsAttention.notes.failed);
      })
      .finally(() => setBusy((before) => new Set([...before].filter((one) => one !== id))));
  };
  const dismiss = async (entry: RejectedCommand, reason: ChosenReason): Promise<string | null> => {
    if (client === null || place === null) return vi.needsAttention.notes.failed;
    try {
      const order = await orderOfRefused(client, entry);
      let approvalId: string | null = null;
      // Giving up money or food of an order is a manager's call, as closing an unpaid table is.
      if (dismissalNeedsApproval(entry) && order !== null) {
        const said = vi.approval.actions.dismissRefused(
          commandNameOf(entry.command.type),
          order.number,
        );
        const outcome = await gate.require(closeUnpaidTable(order.id), said);
        if (outcome.kind === "denied") return vi.approval.denied;
        const approval = approvalOf(outcome);
        if (approval === undefined) return null;
        approvalId = approval?.approvalId ?? null;
      }
      const extra = { orderId: order?.id ?? null, approvalId };
      await client.enqueue(dismissRejectionCommand(place, entry, reason, Date.now(), extra));
      await settle(entry);
      setDismissing(null);
      onSent();
      return null;
    } catch (error) {
      console.error(error);
      return vi.needsAttention.notes.failed;
    }
  };
  const settledQr = useSettledQrClosing(client, place, rejected);
  const shift = useTillShift(client, place?.deviceId ?? "");
  /** The order waiting for the shift the cashier is opening for it. */
  const [opening, setOpening] = useState<string | null>(null);

  const close = (orderId: string) =>
    settledQr.close(orderId).then((outcome) => {
      if (outcome === "needs_shift") setOpening(orderId);
      if (outcome === "sent") onSent();
    }, console.error);

  if (gate.sheet !== null) return gate.sheet;
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
  if (dismissing !== null) {
    return (
      <DismissRejectionScreen
        commandType={dismissing.command.type}
        code={dismissing.code}
        reasons={dismissalReasonsOf(dismissing)}
        needsWords={dismissalNeedsWords(dismissing)}
        onConfirm={(reason) => dismiss(dismissing, reason)}
        onBack={() => setDismissing(null)}
      />
    );
  }
  return (
    <NeedsAttentionScreen
      rejected={rejected}
      closable={settledQr.closable}
      closeNeedsShift={shift.loaded && shift.shift === null}
      onCloseWithSettledQr={(orderId) => void close(orderId)}
      redoable={redoable}
      openable={openable}
      notes={notes}
      busy={busy}
      onRedo={redo}
      onOpenOrder={props.onOpenOrder}
      onDismiss={setDismissing}
      onBack={props.onBack}
    />
  );
}

/**
 * The order a refused command was about and its number on the till: named by the command, or,
 * for a QR taken down, by the QR's row. Null when the till cannot tell.
 */
async function orderOfRefused(
  client: SyncClient,
  entry: RejectedCommand,
): Promise<{ id: string; number: number | null } | null> {
  let id = orderIdOfRejected(entry);
  if (id === null && entry.entity === PAYMENT_INTENT_ENTITY) {
    const intent = await client.snapshot(PAYMENT_INTENT_ENTITY, entry.entityId);
    const read = intent === null ? null : readIntentSnapshot(intent.snapshot);
    id = read?.orderId ?? null;
  }
  if (id === null) return null;
  const row = await client.snapshot("order", id);
  const stored = row === null ? null : readStoredOrder(row.snapshot);
  return { id, number: stored?.deviceOrderNo ?? null };
}
