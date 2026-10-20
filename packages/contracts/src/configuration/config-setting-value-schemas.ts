import { z } from "zod";

/**
 * shift_close_difference_tolerance: how far, in đồng either way, a counted drawer may be
 * off before someone has to accept it. A decimal string, like every money setting, so it
 * stays exact; whole đồng, never negative.
 */
export const closeDifferenceToleranceSettingSchema = z.string().regex(/^(0|[1-9]\d{0,17})$/);

/** void_after_sent_needs_approval: cancelling what the kitchen has needs an approver. */
export const voidAfterSentNeedsApprovalSettingSchema = z.boolean();
