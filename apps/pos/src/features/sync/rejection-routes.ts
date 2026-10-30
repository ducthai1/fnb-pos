import { DISMISSAL_APPROVAL_TYPES, DISMISSAL_NOTE_REQUIRED_TYPES } from "@fnb/contracts";
import type { RejectedCommand } from "@fnb/sync-client";
import {
  DISMISS_REASONS,
  DISMISS_REASONS_WITH_WORDS,
  type ReasonCode,
} from "../order-adjust/reason-codes";
import { isStaleDraft } from "../table-order/redo-stale-draft";

type Refused = Pick<RejectedCommand, "code" | "command">;

/** The server wants a manager's approval the command did not carry (or carried wrongly). */
export const askedForApproval = (refused: Refused): boolean =>
  refused.code.startsWith("SYNC_APPROVAL_");

/** A draft another till changed first: it can be saved again over the server's newer copy. */
export const canRedo = (refused: Refused): boolean => isStaleDraft(refused);

/**
 * Whether setting the command aside needs the staff member's words about what became of it:
 * it moves money or tells the kitchen to make food, so nothing may vanish with only a key.
 */
export const dismissalNeedsWords = (refused: Refused): boolean =>
  DISMISSAL_NOTE_REQUIRED_TYPES.has(refused.command.type);

/**
 * Whether setting the command aside gives up money or food of an order, so a staff member
 * without close_unpaid_table needs a manager's approval first, as the server judges it.
 */
export const dismissalNeedsApproval = (refused: Refused): boolean =>
  DISMISSAL_APPROVAL_TYPES.has(refused.command.type);

/** The reasons offered for setting a refusal aside. */
export const dismissalReasonsOf = (refused: Refused): readonly ReasonCode[] =>
  dismissalNeedsWords(refused) ? DISMISS_REASONS_WITH_WORDS : DISMISS_REASONS;
