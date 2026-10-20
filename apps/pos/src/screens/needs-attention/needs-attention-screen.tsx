import type { RejectedCommand } from "@fnb/sync-client";
import { orderIdOfRejected } from "../../features/payment/use-settled-qr-closing";
import { messageForCode, vi } from "../../messages/vi";
import { ScreenFrame } from "../shared/screen-frame";

const NO_CLOSABLE: ReadonlySet<string> = new Set();

/**
 * Commands the server refused for good, each with what it means. An order the server would
 * not take cash for because its QR was paid is closed with that QR right here.
 */
export function NeedsAttentionScreen({
  rejected,
  closable = NO_CLOSABLE,
  onCloseWithSettledQr,
  onBack,
}: {
  rejected: readonly RejectedCommand[];
  /** Orders that can be closed with the QR the bank paid for them. */
  closable?: ReadonlySet<string>;
  onCloseWithSettledQr?: (orderId: string) => void;
  onBack: () => void;
}) {
  return (
    <ScreenFrame title={vi.needsAttention.title}>
      <p className="pos-hint">{vi.needsAttention.hint}</p>
      {rejected.length === 0 ? (
        <p className="pos-hint">{vi.needsAttention.empty}</p>
      ) : (
        <ul className="pos-list">
          {rejected.map((entry) => {
            const orderId = orderIdOfRejected(entry);
            const canClose = orderId !== null && closable.has(orderId);
            return (
              <li
                key={entry.command.commandId}
                className="pos-card pos-wrap pos-rejected"
                data-rejected-code={entry.code}
              >
                <p className="pos-rejected__sentence">{messageForCode(entry.code)}</p>
                <p className="pos-hint">
                  {vi.needsAttention.commandLine(entry.command.type, entry.code)}
                </p>
                {canClose && onCloseWithSettledQr !== undefined ? (
                  <button
                    type="button"
                    className="pos-button pos-button--primary"
                    onClick={() => onCloseWithSettledQr(orderId)}
                  >
                    {vi.qr.closeWithSettledQr}
                  </button>
                ) : null}
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
