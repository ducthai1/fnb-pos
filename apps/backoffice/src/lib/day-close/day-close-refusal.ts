import type { ApiFailure } from "../api/api-result";
import { type DayInvoice, type DayOrder, readDayInvoice, readDayOrder, readIds } from "../api/day-close-api";
import { isRecord, listOf } from "../api/read-json-fields";

/** What a refused close says is still open, as the refusal lists it. */
export type DayCloseBlockers =
  | { readonly kind: "shifts"; readonly shiftIds: readonly string[] }
  | { readonly kind: "drafts"; readonly drafts: readonly DayOrder[] }
  | { readonly kind: "invoices"; readonly invoices: readonly DayInvoice[] };

/**
 * The list a 409 from closing the day carries (open shifts, open drafts or queued
 * invoices), or null for any other refusal. The page shows the list of the refusal itself,
 * not the status it loaded earlier: a till may have opened a shift in between.
 */
export function dayCloseBlockersOf(failure: ApiFailure): DayCloseBlockers | null {
  if (failure.status !== 409 || !isRecord(failure.body)) return null;
  const body = failure.body;
  if (failure.code === "API_DAY_CLOSE_SHIFTS_OPEN") {
    const shiftIds = readIds(body.shiftIds);
    return shiftIds === null ? null : { kind: "shifts", shiftIds };
  }
  if (failure.code === "API_DAY_CLOSE_DRAFTS_OPEN") {
    const drafts = listOf(body.drafts, readDayOrder);
    return drafts === null ? null : { kind: "drafts", drafts };
  }
  if (failure.code === "API_DAY_CLOSE_INVOICES_UNISSUED") {
    const invoices = listOf(body.invoices, readDayInvoice);
    return invoices === null ? null : { kind: "invoices", invoices };
  }
  return null;
}
