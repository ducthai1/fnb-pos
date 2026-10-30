import type { RejectedCommand } from "@fnb/sync-client";
import { orderIdOfRejected } from "../../features/payment/use-settled-qr-closing";
import { askedForApproval } from "../../features/sync/rejection-routes";
import { refusalSentence, vi } from "../../messages/vi";
import { commandNameOf } from "../../messages/vi-sync-errors";
import { ScreenFrame } from "../shared/screen-frame";
import { EmptyState } from "../shared/state-view";

const NONE: ReadonlySet<string> = new Set();
const NO_NOTES: ReadonlyMap<string, string> = new Map();

/**
 * Commands the server refused for good, each with what it means and what can be done about
 * it: an order the server would not take cash for because its QR was paid is closed with
 * that QR (once the till has a shift open for the money to go into); a draft another till
 * changed first is saved again over the newer order; an order still on the till is opened
 * to be fixed, or to get a manager's approval and be sent again; and any refusal can be set
 * aside with a reason the server keeps.
 */
export function NeedsAttentionScreen({
  rejected,
  closable = NONE,
  closeNeedsShift = false,
  onCloseWithSettledQr,
  redoable = NONE,
  openable = NONE,
  notes = NO_NOTES,
  busy = NONE,
  onRedo,
  onOpenOrder,
  onDismiss,
  onBack,
}: {
  rejected: readonly RejectedCommand[];
  /** Orders that can be closed with the QR the bank paid for them. */
  closable?: ReadonlySet<string>;
  /** The till has no shift open, so closing one of them opens the shift first. */
  closeNeedsShift?: boolean;
  onCloseWithSettledQr?: (orderId: string) => void;
  /** Ids of the refused commands (drafts) that can be saved again over the newer order. */
  redoable?: ReadonlySet<string>;
  /** Orders still on the till as drafts, which can be opened. */
  openable?: ReadonlySet<string>;
  /** What an action said back for a refused command, by its id. */
  notes?: ReadonlyMap<string, string>;
  /** Ids of the refused commands an action is working on. */
  busy?: ReadonlySet<string>;
  onRedo?: (entry: RejectedCommand) => void;
  onOpenOrder?: (orderId: string) => void;
  onDismiss?: (entry: RejectedCommand) => void;
  onBack: () => void;
}) {
  return (
    <ScreenFrame title={vi.needsAttention.title}>
      <p className="pos-hint">{vi.needsAttention.hint}</p>
      {rejected.length === 0 ? (
        <EmptyState title={vi.needsAttention.empty} />
      ) : (
        <ul className="pos-list">
          {rejected.map((entry) => {
            const orderId = orderIdOfRejected(entry);
            const canClose = orderId !== null && closable.has(orderId);
            const commandId = entry.command.commandId;
            const canRedo = redoable.has(commandId) && onRedo !== undefined;
            const canOpen = orderId !== null && openable.has(orderId) && onOpenOrder !== undefined;
            const said = notes.get(commandId);
            return (
              <li
                key={entry.command.commandId}
                className="pos-card pos-wrap pos-rejected"
                data-rejected-code={entry.code}
              >
                <p className="pos-rejected__sentence">
                  {refusalSentence(entry.command.type, entry.code)}
                </p>
                <p className="pos-hint">
                  {vi.needsAttention.commandLine(commandNameOf(entry.command.type), entry.code)}
                </p>
                {said === undefined ? null : <p className="pos-rejected__note">{said}</p>}
                <div className="pos-rejected__actions">
                  {canClose && onCloseWithSettledQr !== undefined ? (
                    <button
                      type="button"
                      className="pos-button pos-button--primary"
                      onClick={() => onCloseWithSettledQr(orderId)}
                    >
                      {closeNeedsShift ? vi.qr.openShiftToClose : vi.qr.closeWithSettledQr}
                    </button>
                  ) : null}
                  {canRedo ? (
                    <button
                      type="button"
                      className="pos-button pos-button--primary"
                      disabled={busy.has(commandId)}
                      onClick={() => onRedo(entry)}
                    >
                      {busy.has(commandId) ? vi.needsAttention.working : vi.needsAttention.redo}
                    </button>
                  ) : null}
                  {canOpen ? (
                    <button
                      type="button"
                      className="pos-button"
                      onClick={() => onOpenOrder(orderId)}
                    >
                      {askedForApproval(entry)
                        ? vi.needsAttention.openForApproval
                        : vi.needsAttention.open}
                    </button>
                  ) : null}
                  {onDismiss === undefined ? null : (
                    <button type="button" className="pos-button" onClick={() => onDismiss(entry)}>
                      {vi.needsAttention.dismiss}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="pos-button pos-button--primary" onClick={onBack}>
        {vi.needsAttention.back}
      </button>
    </ScreenFrame>
  );
}
