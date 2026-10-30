import { OTHER_REASON_CODE, REASON_NOTE_MAX_LENGTH } from "@fnb/contracts";

/**
 * Why units were voided, a draft cancelled or a sale refunded, as the commands carry it: a
 * key, never free text, so reports group by it. The shop cannot edit these lists yet; each
 * ends with "other" so a reason nobody foresaw still has a place, said in a note.
 */
export const VOID_REASONS = [
  "customer_changed_mind",
  "wrong_item",
  "made_wrong",
  "out_of_stock",
  "other",
] as const;

export const CANCEL_REASONS = ["customer_left", "duplicate_order", "test_order", "other"] as const;

/** Why an order with nothing left on it is closed to free its table: never picked from a list. */
export const TABLE_EMPTIED_REASON = "table_emptied";

export const REFUND_REASONS = [
  "customer_returned",
  "made_wrong",
  "quality_issue",
  "overcharged",
  "other",
] as const;

export type ReasonCode =
  | (typeof VOID_REASONS)[number]
  | (typeof CANCEL_REASONS)[number]
  | (typeof REFUND_REASONS)[number]
  | typeof TABLE_EMPTIED_REASON;

/** A reason as a command carries it: its key, and the note "other" needs. */
export interface ChosenReason {
  readonly code: ReasonCode;
  /** What the staff member wrote, trimmed; null for a reason of the list. */
  readonly note: string | null;
}

export { REASON_NOTE_MAX_LENGTH };

/** Whether `code` needs the staff member to say what happened. */
export const needsNote = (code: ReasonCode | null): boolean => code === OTHER_REASON_CODE;

/**
 * The reason chosen, ready to be recorded, or null while it is not: none chosen yet, or
 * "other" without a note of 1–120 characters once trimmed (the server refuses it so too).
 */
export function chosenReason(code: ReasonCode | null, note: string): ChosenReason | null {
  if (code === null) return null;
  if (!needsNote(code)) return { code, note: null };
  const said = note.trim();
  return said.length > 0 && said.length <= REASON_NOTE_MAX_LENGTH ? { code, note: said } : null;
}

/** The reason's part of a command payload: its key, and its note when it has one. */
export const reasonOnWire = (reason: ChosenReason) => ({
  reasonCode: reason.code,
  ...(reason.note === null ? {} : { reasonNote: reason.note }),
});
