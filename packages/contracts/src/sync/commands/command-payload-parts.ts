import { z } from "zod";
import { wholeDongSchema } from "../../primitives/money-schema";

/**
 * A key the shop configures ("cash", "card", "momo"), as the payment table stores it, so a
 * method the database would refuse is refused here with the command's own code instead.
 */
export const paymentMethodSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);

/**
 * Why units were voided, a draft cancelled or a sale refunded: a key from the shop's list
 * ("customer_changed_mind", "wrong_item"), never free text, so reports can group by it.
 */
export const reasonCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

/** The reason key every list ends with for what none of its reasons says. */
export const OTHER_REASON_CODE = "other";

/** The longest note a staff member may write about an "other" reason. */
export const REASON_NOTE_MAX_LENGTH = 120;

/**
 * What the staff member wrote about a reason none of the list's words fit: trimmed, then
 * 1–120 characters. A note of spaces only says nothing, so it is refused like none.
 */
export const reasonNoteSchema = z.string().trim().min(1).max(REASON_NOTE_MAX_LENGTH);

/** Whether a reason must come with a note: "other" names nothing by itself. */
export const reasonNeedsNote = (reasonCode: string): boolean => reasonCode === OTHER_REASON_CODE;

/** Money a till took for an order: whole đồng, never below zero. */
export const tenderedAmountSchema = wholeDongSchema.nonnegative();
