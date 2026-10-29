import { useEffect, useState } from "react";

/** Extra milliseconds past the movement before the element goes, so its last frame is seen. */
const SLACK_MS = 30;

/** A duration token of backoffice-tokens.css in milliseconds; 0 when unset or when motion is reduced. */
export function tokenMs(name: string): number {
  if (typeof document === "undefined") return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = Number.parseFloat(value);
  if (!Number.isFinite(ms)) return 0;
  return value.endsWith("ms") ? ms : ms * 1000;
}

/**
 * Keeps a layer on the page while it plays its leaving movement. `present` is what to render
 * (`open`, or the time it takes to leave after `open` turned false); `leaving` marks it for the
 * CSS that moves it out (`[data-leaving]`, by the `durationToken`). The element goes at a timer,
 * never at an `animationend`/frame callback: a hidden or headless page may never fire those, and
 * the layer must not stay behind. Opening again while it leaves stops the timer and the same
 * element stays (CSS transitions turn back from where they are, so nothing blinks or doubles).
 * With motion off (the tokens are 0) it goes in the same render.
 */
export function usePresence(open: boolean, durationToken: string): { present: boolean; leaving: boolean } {
  const [was, setWas] = useState(open);
  const [lingering, setLingering] = useState(false);
  // Derived while rendering, so the first frame of leaving already carries the mark.
  if (was !== open) {
    setWas(open);
    setLingering(!open && tokenMs(durationToken) > 0);
  }
  useEffect(() => {
    if (!lingering) return undefined;
    const timer = setTimeout(() => setLingering(false), tokenMs(durationToken) + SLACK_MS);
    return () => clearTimeout(timer);
  }, [lingering, durationToken]);
  return { present: open || lingering, leaving: !open && lingering };
}
