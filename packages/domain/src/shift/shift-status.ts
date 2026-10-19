import { DomainError } from "../errors";
import { SHIFT_ERROR_CODES } from "./shift-error-codes";

/**
 * opening: the starting float is being counted; open: the drawer takes sales and cash
 * moves; closing: the end count is in progress; closed: the count is settled and the
 * shift's books are final. Counting may be abandoned (closing → open) when a customer walks
 * up mid-count, but a closed shift never reopens: late sales are recorded against it as
 * adjustments, not by rewriting the close.
 */
export type ShiftStatus = "opening" | "open" | "closing" | "closed";

const ALLOWED_TRANSITIONS: Readonly<Record<ShiftStatus, readonly ShiftStatus[]>> = {
  opening: ["open"],
  open: ["closing"],
  closing: ["open", "closed"],
  closed: [],
};

export function transitionShift(from: ShiftStatus, to: ShiftStatus): ShiftStatus {
  if (ALLOWED_TRANSITIONS[from].includes(to)) return to;
  throw new DomainError(
    SHIFT_ERROR_CODES.invalidTransition,
    `a shift cannot move from ${from} to ${to}`,
    { from, to },
  );
}

/**
 * Cash may go in or out of the drawer outside a sale only while the shift is open: during
 * a count it would make the count wrong, and after the close nobody is there to count it.
 */
export function assertAcceptsCashMoves(status: ShiftStatus): void {
  if (status === "open") return;
  throw new DomainError(SHIFT_ERROR_CODES.notOpen, `a ${status} shift takes no cash moves`, {
    status,
  });
}
