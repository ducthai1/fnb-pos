import { isDomainError } from "@fnb/domain";
import { messageForCode, vi } from "../../messages/vi";
import { NothingSavedError } from "../order/order-session-types";
import { DiscountRoundsToNothingError } from "./discount-adjustment";

/**
 * The sentence for why an adjustment could not be made on the till: the domain's refusal by
 * its code, or the till's own. Anything else is a bug and is thrown on.
 */
export function adjustRefusal(error: unknown): string {
  if (isDomainError(error)) return messageForCode(error.code);
  if (error instanceof DiscountRoundsToNothingError) return vi.adjust.discount.roundsToNothing;
  if (error instanceof NothingSavedError) return vi.adjust.notSaved;
  throw error;
}
