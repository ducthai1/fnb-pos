import { z } from "zod";
import { moneySchema } from "../../primitives/money-schema";
import { rateSchema } from "../../primitives/rate-schema";
import { uuidSchema } from "../../primitives/uuid-schema";

const percent = z.object({ kind: z.literal("percent"), rate: rateSchema });

const common = {
  orderId: uuidSchema,
  /**
   * Ids for the discount lines, made on the till where the discount was given. The server
   * builds one line per tax rate and takes the ids in this order; ids it does not need are
   * left unused, so a till that miscounted the rates still gets its discount.
   */
  discountLineIds: z.array(uuidSchema).min(1).max(20),
  /** A manager's approval, needed when the discount goes past the staff member's cap. */
  approvalId: uuidSchema.optional(),
};

/**
 * order.apply_discount: a discount on the whole order or on one sold item. The amount is
 * worked out by the server on the order it holds; a fixed amount is the amount the customer
 * was told, never cut down to fit.
 */
export const applyDiscountPayloadSchema = z.discriminatedUnion("scope", [
  z.object({
    ...common,
    scope: z.literal("order"),
    discount: z.discriminatedUnion("kind", [
      percent,
      z.object({ kind: z.literal("fixed"), amount: moneySchema }),
    ]),
  }),
  z.object({
    ...common,
    scope: z.literal("line"),
    lineId: uuidSchema,
    discount: z.discriminatedUnion("kind", [
      percent,
      z.object({ kind: z.literal("fixed_for_line"), amount: moneySchema }),
    ]),
  }),
]);

export type ApplyDiscountPayload = z.infer<typeof applyDiscountPayloadSchema>;
