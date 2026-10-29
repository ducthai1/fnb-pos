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
export function tokenMs(name: string): number {
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

/** Extra milliseconds past the movement before the element goes, so its last frame is seen. */
const SLACK_MS = 30;

/**
 * Keeps a layer on the page while it plays its leaving movement: `present` is what to render
 * (`open`, or the time it takes to leave after `open` turned false) and `leaving` marks it for
 * the CSS that moves it out (`[data-leaving]`, by the `durationToken`). It goes at a timer, never
 * at an animation or frame callback, which a hidden or headless page may never fire. Opening
 * again while it leaves stops the timer and keeps the same element (the CSS turns back from
 * where it is, so nothing blinks or doubles). With motion off it goes in the same render.
 */
export function usePresence(
  open: boolean,
  durationToken: string,
): { present: boolean; leaving: boolean } {
  const [was, setWas] = useState(open);
  const [lingering, setLingering] = useState(false);
  // Derived while rendering, so the first frame of leaving already carries the mark.
  if (was !== open) {
    setWas(open);
    setLingering(!open && motionPlays() && tokenMs(durationToken) > 0);
  }
  useEffect(() => {
    if (!lingering) return undefined;
    const timer = setTimeout(() => setLingering(false), tokenMs(durationToken) + SLACK_MS);
    return () => clearTimeout(timer);
  }, [lingering, durationToken]);
  return { present: open || lingering, leaving: !open && lingering };
}
