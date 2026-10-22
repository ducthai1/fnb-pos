import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the till plays its movements: not when the machine asks for reduced motion, not on
 * a page that switched motion off (the layout tests, the handbook pictures), and not where
 * nothing is laid out at all (component tests), so no test ever waits on a movement.
 */
export function motionPlays(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  if (document.documentElement.dataset.motion === "off") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A duration token of pos-tokens.css in milliseconds, 0 when it is not set. */
function tokenMs(name: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = Number.parseFloat(value);
  if (!Number.isFinite(ms)) return 0;
  return value.endsWith("ms") ? ms : ms * 1000;
}

/**
 * Plays a leaving movement before `then` runs: `leaving` marks the element for its exit
 * animation (CSS, named by the `durationToken`), and `then` runs when it has played, or at
 * once when nothing moves. A second request while leaving does nothing.
 */
export function useLeaveThen(then: () => void, durationToken: string) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(then);
  latest.current = then;
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const leave = useCallback(() => {
    if (timer.current !== null) return;
    const ms = motionPlays() ? tokenMs(durationToken) : 0;
    if (ms === 0) return latest.current();
    setLeaving(true);
    timer.current = setTimeout(() => latest.current(), ms);
  }, [durationToken]);
  return { leaving, leave };
}
