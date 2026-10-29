import { useCallback, useEffect, useState } from "react";
import type { TillShiftState } from "../features/shift/use-till-shift";
import { type UpdateDecision, decideUpdate } from "../features/updates/update-policy";
import type { UpdateSource } from "../features/updates/release-watch";

/** Evaluated again this often while a release waits: an open dialog or an idle till leaves no event. */
const RECHECK_MS = 5_000;
/** The release the page last reloaded into on its own; a second automatic try of it would loop. */
const ATTEMPT_KEY = "fnb.pos.update-attempt";

/** Anything that is a flow in progress marks itself a dialog; payment and approval drawers do. */
const dialogIsOpen = () => document.querySelector('[role="dialog"]') !== null;

function attemptedRelease(): string | null {
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY);
  } catch {
    return null;
  }
}

function rememberAttempt(release: string) {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, release);
  } catch {
    // Without session storage a stale cache could reload again; the next poll still waits.
  }
}

export interface AppUpdate {
  readonly decision: UpdateDecision;
  readonly updating: boolean;
  /** The cashier's button: reloads only if nothing is unsent or open. */
  updateNow(): void;
}

/**
 * Follows the release the server serves and decides, with decideUpdate, when the till
 * reloads into it. A release that was already tried by an automatic reload this session and
 * is still not the running one (a stale cache) is not retried by itself, so a till can never
 * reload in a loop.
 */
export function useAppUpdate(
  source: UpdateSource | undefined,
  shift: TillShiftState,
  pendingCommands: number | null,
  reload: () => void,
): AppUpdate {
  const [available, setAvailable] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [, tick] = useState(0);
  const [lastTouch, setLastTouch] = useState(() => Date.now());

  useEffect(() => source?.subscribe(setAvailable), [source]);
  useEffect(() => {
    const touched = () => setLastTouch(Date.now());
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, touched, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, touched);
    };
  }, []);
  useEffect(() => {
    if (available === null) return;
    const timer = setInterval(() => tick((count) => count + 1), RECHECK_MS);
    return () => clearInterval(timer);
  }, [available]);

  const tried = available !== null && attemptedRelease() === available;
  const decision = decideUpdate({
    updateAvailable: available !== null,
    shiftOpen: shift.loaded ? shift.shift !== null : null,
    pendingCommands,
    dialogOpen: available !== null && dialogIsOpen(),
    // A release tried before is never applied by itself: it reads as a till in use.
    idleMs: tried ? 0 : Date.now() - lastTouch,
  });

  const apply = useCallback(() => {
    if (available === null) return;
    rememberAttempt(available);
    setUpdating(true);
    reload();
  }, [available, reload]);
  useEffect(() => {
    if (decision.action === "apply" && !dialogIsOpen()) apply();
  }, [decision.action, apply]);

  const updateNow = useCallback(() => {
    if (decision.action === "banner" && decision.blockedBy === null) apply();
  }, [decision, apply]);
  return { decision, updating, updateNow };
}
