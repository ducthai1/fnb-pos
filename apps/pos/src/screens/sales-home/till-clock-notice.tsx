import { clockOffMinutes } from "../../features/sync/till-sync-status";
import { VI_TILL_CLOCK } from "../../messages/vi-shift-tools";

/**
 * A yellow line while the till's clock is more than two minutes off the server's. Nothing
 * is refused for it (the till dates its commands by the server's clock); it is there so
 * someone sets the PC's clock right before the till next has to sell offline for long.
 */
export function TillClockNotice({ offsetMs }: { offsetMs: number | null | undefined }) {
  const minutes = clockOffMinutes(offsetMs);
  if (minutes === null) return null;
  return (
    <p className="pos-notice pos-wrap" role="status" data-tone="warn" data-till-clock="off">
      {VI_TILL_CLOCK.off(minutes)}
    </p>
  );
}
