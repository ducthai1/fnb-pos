import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";

/** POST /branches/:branchId/day-close: the business day to close. */
export const dayCloseBodySchema = z.object({ businessDate: businessDateSchema }).strict();

/** GET /branches/:branchId/day-close?businessDate=: where that day stands. */
export const dayCloseQuerySchema = z.object({ businessDate: businessDateSchema }).strict();

export type DayCloseBody = z.infer<typeof dayCloseBodySchema>;
