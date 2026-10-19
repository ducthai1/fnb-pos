import { z } from "zod";
import { quantitySchema } from "../../primitives/quantity-schema";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema } from "./command-payload-parts";

/**
 * order.void_line: cancel units of a sold item on a draft. The intent only: the server
 * works out which units the kitchen already has, and builds any cancel line itself.
 */
export const voidLinePayloadSchema = z.object({
  orderId: uuidSchema,
  lineId: uuidSchema,
  quantity: quantitySchema,
  reasonCode: reasonCodeSchema,
  /** A manager's approval, needed when units the kitchen has are cancelled. */
  approvalId: uuidSchema.optional(),
});

export type VoidLinePayload = z.infer<typeof voidLinePayloadSchema>;
