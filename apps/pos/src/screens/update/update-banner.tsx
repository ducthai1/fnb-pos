import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { UpdateBlock } from "../../features/updates/update-policy";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { motionPlays } from "../shared/use-leave-motion";

/** How long the closing movement runs; matches --t-exit in pos-tokens.css. */
const LEAVE_MS = 120;

export interface UpdateBannerProps {
  /** Whether a release is waiting and a shift is open, i.e. the banner should show. */
  readonly open: boolean;
  readonly blockedBy: UpdateBlock | null;
  readonly pendingCommands: number;
  readonly updating: boolean;
  onUpdate(): void;
}

/** Stays drawn for the length of its closing movement after `open` turns false. */
function useStillDrawn(open: boolean): boolean {
  const [drawn, setDrawn] = useState(open);
  useEffect(() => {
    if (open) return setDrawn(true);
    if (!motionPlays()) return setDrawn(false);
    const timer = setTimeout(() => setDrawn(false), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return open || drawn;
}

/**
 * A card floating at the foot of the screen while a new release waits for the shift to end.
 * The button updates at once, but only when nothing unsent or open would be lost; when it
 * cannot, it is disabled and the card says what to wait for.
 */
export function UpdateBanner(props: UpdateBannerProps) {
  const drawn = useStillDrawn(props.open);
  if (!drawn) return null;
  const reason =
    props.blockedBy === "outbox"
      ? vi.update.waitOutbox(props.pendingCommands)
      : props.blockedBy === "dialog"
        ? vi.update.waitDialog
        : null;
  return (
    <aside
      className="pos-update"
      role="status"
      data-update-banner
      data-state={props.open ? "open" : "closed"}
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
      <button
        type="button"
        className="pos-button pos-button--primary"
        disabled={props.blockedBy !== null || props.updating}
        onClick={props.onUpdate}
      >
        {props.updating ? vi.update.updating : vi.update.now}
      </button>
    </aside>
  );
}
