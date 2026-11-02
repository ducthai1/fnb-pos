import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";
import { wholeDongSchema } from "../primitives/money-schema";

/** POST /branches/:branchId/day-close: the business day to close. */
export const dayCloseBodySchema = z.object({ businessDate: businessDateSchema }).strict();

/** GET /branches/:branchId/day-close?businessDate=: where that day stands. */
export const dayCloseQuerySchema = z.object({ businessDate: businessDateSchema }).strict();

export type DayCloseBody = z.infer<typeof dayCloseBodySchema>;

/**
 * POST /shifts/:shiftId/close-on-behalf: what a manager counted in the drawer of a revoked
 * till, in whole đồng (any amount: coins and torn notes are counted too), and the version of
 * the shift the manager read, so cash arriving in between is not closed on unseen.
 */
export const closeShiftOnBehalfBodySchema = z
  .object({
    countedCash: wholeDongSchema.nonnegative(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type CloseShiftOnBehalfBody = z.infer<typeof closeShiftOnBehalfBodySchema>;
