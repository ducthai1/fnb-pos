import type { RejectedCommand } from "@fnb/sync-client";
import { vi } from "../../messages/vi";
import { ScreenFrame } from "../shared/screen-frame";

/** Commands the server refused for good. Resolving them is a later screen; this lists them. */
export function NeedsAttentionScreen({
  rejected,
  onBack,
}: {
  rejected: readonly RejectedCommand[];
  onBack: () => void;
}) {
  return (
    <ScreenFrame title={vi.needsAttention.title}>
      <p className="pos-hint">{vi.needsAttention.hint}</p>
      {rejected.length === 0 ? (
        <p className="pos-hint">{vi.needsAttention.empty}</p>
      ) : (
        <ul className="pos-list">
          {rejected.map((entry) => (
            <li key={entry.command.commandId} className="pos-card pos-wrap">
              {vi.needsAttention.commandLine(entry.command.type, entry.code)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="pos-button pos-button--primary" onClick={onBack}>
        {vi.needsAttention.back}
      </button>
    </ScreenFrame>
  );
}
