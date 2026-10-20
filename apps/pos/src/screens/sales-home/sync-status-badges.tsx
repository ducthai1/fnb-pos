import type { TillConnection, TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";

const CONNECTION_TEXT: Record<TillConnection, string> = {
  checking: vi.sync.checking,
  online: vi.sync.online,
  offline: vi.sync.offline,
  server_error: vi.sync.serverError,
};

/** The till's sync state at a glance: link, unsent commands, refused commands. */
export function SyncStatusBadges({
  status,
  onOpenNeedsAttention,
}: {
  status: TillSyncStatus;
  onOpenNeedsAttention: () => void;
}) {
  return (
    <div className="pos-badges" aria-live="polite">
      <span className="pos-badge" data-connection={status.connection}>
        {CONNECTION_TEXT[status.connection]}
      </span>
      <span className="pos-badge" data-pending={status.pending}>
        {status.pending === 0 ? vi.sync.allSynced : vi.sync.pending(status.pending)}
      </span>
      {status.needsAttention > 0 ? (
        <a
          className="pos-badge pos-badge--attention"
          href="#can-xu-ly"
          onClick={(event) => {
            event.preventDefault();
            onOpenNeedsAttention();
          }}
        >
          {vi.sync.needsAttention(status.needsAttention)}
        </a>
      ) : null}
    </div>
  );
}
