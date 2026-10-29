/** How long nobody touches the till before it may reload itself between shifts. */
export const AUTO_APPLY_IDLE_MS = 20_000;

/** What stands between the till and the reload; the outbox is named before an open dialog. */
export type UpdateBlock = "outbox" | "dialog";

export interface UpdateSituation {
  /** A release other than the running one is being served. */
  readonly updateAvailable: boolean;
  /** Whether this device has an open shift; null until it has been read. */
  readonly shiftOpen: boolean | null;
  /** Commands recorded here and not settled by the server; null until known. */
  readonly pendingCommands: number | null;
  /** A drawer or dialog (a payment, an approval, a count) is open. */
  readonly dialogOpen: boolean;
  /** How long since anyone touched the screen. */
  readonly idleMs: number;
}

export type UpdateDecision =
  /** Nothing to do: already on the served release. */
  | { readonly action: "none" }
  /** An update waits for a quiet moment; nothing is shown. */
  | { readonly action: "wait" }
  /** Reload now: no shift, nothing unsent, nothing open, nobody at the screen. */
  | { readonly action: "apply" }
  /** A shift is open: say so, and let the cashier update when nothing blocks it. */
  | { readonly action: "banner"; readonly blockedBy: UpdateBlock | null };

/**
 * When the till reloads into a new release. A reload loses what is half done and, if
 * commands are unsent, can strand them, so it never happens while the outbox holds
 * anything or a flow is open. With no shift it happens by itself once the till is idle;
 * with a shift open only the cashier's button does it, and only when nothing blocks it.
 */
export function decideUpdate(situation: UpdateSituation): UpdateDecision {
  if (!situation.updateAvailable) return { action: "none" };
  if (situation.shiftOpen === null) return { action: "wait" };
  const blockedBy: UpdateBlock | null =
    situation.pendingCommands !== 0 ? "outbox" : situation.dialogOpen ? "dialog" : null;
  if (situation.shiftOpen) return { action: "banner", blockedBy };
  if (blockedBy !== null || situation.idleMs < AUTO_APPLY_IDLE_MS) return { action: "wait" };
  return { action: "apply" };
}
