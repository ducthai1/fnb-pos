import {
  CircleAlert,
  CloudCheck,
  CloudUpload,
  LoaderCircle,
  type LucideIcon,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { TillConnection, TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

interface ConnectionLook {
  readonly text: string;
  readonly icon: LucideIcon;
  readonly tone: "ok" | "warn" | "danger" | "info";
}

const CONNECTION: Record<TillConnection, ConnectionLook> = {
  checking: { text: vi.sync.checking, icon: LoaderCircle, tone: "info" },
  online: { text: vi.sync.online, icon: Wifi, tone: "ok" },
  offline: { text: vi.sync.offline, icon: WifiOff, tone: "warn" },
  server_error: { text: vi.sync.serverError, icon: ServerCrash, tone: "warn" },
  update_required: { text: vi.update.required.title, icon: RefreshCw, tone: "danger" },
  origin_refused: { text: vi.errors.API_ORIGIN_NOT_ALLOWED, icon: ShieldAlert, tone: "danger" },
};

/** The till's sync state at a glance: refused commands first, then link and unsent ones. */
export function SyncStatusBadges({
  status,
  onOpenNeedsAttention,
}: {
  status: TillSyncStatus;
  onOpenNeedsAttention: () => void;
}) {
  const link = CONNECTION[status.connection];
  return (
    <div className="pos-badges" aria-live="polite">
      {status.needsAttention > 0 ? (
        <a
          className="pos-badge pos-badge--attention"
          data-tone="danger"
          href="#can-xu-ly"
          onClick={(event) => {
            event.preventDefault();
            onOpenNeedsAttention();
          }}
        >
          <Icon of={CircleAlert} size={18} />
          {vi.sync.needsAttention(status.needsAttention)}
        </a>
      ) : null}
      <span className="pos-badge" data-connection={status.connection} data-tone={link.tone}>
        <Icon of={link.icon} size={18} />
        {link.text}
      </span>
      <span
        className="pos-badge"
        data-pending={status.pending}
        data-tone={status.pending === 0 ? "ok" : "info"}
      >
        <Icon of={status.pending === 0 ? CloudCheck : CloudUpload} size={18} />
        <span className="pos-badge__words">
          {status.pending === 0 ? vi.sync.allSynced : vi.sync.pending(status.pending)}
        </span>
      </span>
    </div>
  );
}
