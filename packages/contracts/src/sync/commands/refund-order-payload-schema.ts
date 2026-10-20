import { z } from "zod";
import { wholeDongSchema } from "../../primitives/money-schema";
import { quantitySchema } from "../../primitives/quantity-schema";
import { uuidSchema } from "../../primitives/uuid-schema";
import { paymentMethodSchema, reasonCodeSchema } from "./command-payload-parts";

/**
 * order.refund: gives back part or all of a paid sale as a refund order of its own, paid
 * out at once. The till names the sold items and units; what they give back is the
 * server's share of what the sale charged.
 */
export const refundOrderPayloadSchema = z.object({
  /** Made on the till, like any order id. */
  refundOrderId: uuidSchema,
  saleOrderId: uuidSchema,
  /** The till's running number, shared with its sales: a refund slip is printed too. */
  deviceOrderNo: z.number().int().positive().safe(),
  lines: z
    .array(z.object({ lineId: uuidSchema, quantity: quantitySchema, restock: z.boolean() }))
    .min(1)
    .max(200),
  reasonCode: reasonCodeSchema,
  /** What left the drawer, as the refund's own payments: negative, like its lines. */
  payouts: z
    .array(z.object({ method: paymentMethodSchema, amount: wholeDongSchema.nonpositive() }))
    .min(1)
    .max(10),
  /** A manager's approval, for staff who may not refund alone. */
  approvalId: uuidSchema.optional(),
  /** The shift whose drawer the cash came out of; a late refund keeps that shift. */
  shiftId: uuidSchema.optional(),
});

export type RefundOrderPayload = z.infer<typeof refundOrderPayloadSchema>;
