import { z } from "zod";

/**
 * What a table shows on the POS floor screen, read from the draft order seated at it:
 * none is free, one is occupied, and one whose pre-bill was printed for its current
 * version is waiting to pay. Any change to that order after printing makes it occupied
 * again, because the printed bill no longer shows what the guests owe.
 */
export const tableStatusSchema = z.enum(["free", "occupied", "awaiting_payment"]);

export type TableStatus = z.infer<typeof tableStatusSchema>;

/** The status of a table from the draft order at it, or null when none is. */
export function tableStatusOf(draft: { readonly preBillPrinted: boolean } | null): TableStatus {
  if (draft === null) return "free";
  return draft.preBillPrinted ? "awaiting_payment" : "occupied";
}

/**
 * A counter order's table number, written down so the order is brought over. Short and
 * free-form ("12", "Sân 3"): it names no table row and holds no table.
 */
export const tableTagSchema = z.string().trim().min(1).max(20);
