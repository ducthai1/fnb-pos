import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { UpdateBlock } from "../../features/updates/update-policy";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { usePresence } from "../shared/use-leave-motion";

export interface UpdateBannerProps {
  /** Whether a release is waiting and a shift is open, i.e. the banner should show. */
  readonly open: boolean;
  readonly blockedBy: UpdateBlock | null;
  readonly pendingCommands: number;
  readonly updating: boolean;
  onUpdate(): void;
}

/**
 * A strip across the top of the till while a new release waits for the shift to end (it is
 * drawn inside the till's frame, so it takes room and covers nothing). The button updates at
 * once, but only when nothing unsent or open would be lost; when it cannot, it is disabled and
 * the strip says what to wait for. It can be folded to a thin line that still says there is a
 * new release; the cashier opens it again with a touch.
 */
export function UpdateBanner(props: UpdateBannerProps) {
  const { present, leaving } = usePresence(props.open, "--t-exit");
  const [folded, setFolded] = useState(false);
  if (!present) return null;
  const reason =
    props.blockedBy === "outbox"
      ? vi.update.waitOutbox(props.pendingCommands)
      : props.blockedBy === "dialog"
        ? vi.update.waitDialog
        : null;
  if (folded) {
    return (
      <aside
        className="pos-update pos-update--folded"
        role="status"
        data-update-banner
        data-folded
        data-leaving={leaving ? "" : undefined}
        inert={leaving}
      >
        <button type="button" className="pos-update__peek" onClick={() => setFolded(false)}>
          <span className="pos-update__dot" aria-hidden="true" />
          <span className="pos-update__peek-text">{vi.update.bannerShort}</span>
          <span className="pos-update__peek-open">{vi.update.unfold}</span>
          <Icon of={ChevronDown} size={18} />
        </button>
      </aside>
    );
  }
  return (
    <aside
      className="pos-update"
      role="status"
      data-update-banner
      data-leaving={leaving ? "" : undefined}
      inert={leaving}
    >
      <span className="pos-update__mark">
        <Icon of={RefreshCw} size={22} />
      </span>
      <div className="pos-update__text">
        <p className="pos-update__title">{vi.update.banner}</p>
        {reason === null ? null : (
          <p className="pos-hint" data-update-reason>
            {reason}
          </p>
        )}
      </div>
      <div className="pos-update__actions">
        <button
          type="button"
          className="pos-button pos-button--primary"
          disabled={props.blockedBy !== null || props.updating}
          onClick={props.onUpdate}
        >
          {props.updating ? vi.update.updating : vi.update.now}
        </button>
        <button
          type="button"
          className="pos-button pos-button--quiet pos-update__fold"
          aria-label={vi.update.fold}
          onClick={() => setFolded(true)}
        >
          <Icon of={ChevronUp} size={22} />
        </button>
      </div>
    </aside>
  );
}
