import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";
import { instantSchema } from "../primitives/instant-schema";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/** How money no sale counts went back to the customer: from the till's cash, or sent back. */
export const QR_REFUND_METHODS = ["cash", "bank_transfer"] as const;
export type QrRefundMethod = (typeof QR_REFUND_METHODS)[number];

/**
 * POST /payments/refund-due/:intentId: a person says the money the bank brought for this
 * QR (listed under refundDue) was handed back to the customer, how, and a note saying to
 * whom or why, which the audit trail keeps.
 */
export const qrRefundBodySchema = z
  .object({
    method: z.enum(QR_REFUND_METHODS),
    note: z.string().trim().min(1).max(500),
  })
  .strict();

/** The QR money handed back: all the bank brought, on the branch's business day it happened. */
export const qrRefundSchema = z
  .object({
    intentId: uuidSchema,
    branchId: uuidSchema,
    amount: wholeDongSchema.positive(),
    method: z.enum(QR_REFUND_METHODS),
    note: z.string(),
    businessDate: businessDateSchema,
    refundedAt: instantSchema,
    refundedByAppUserId: uuidSchema,
  })
  .strict();

export type QrRefundBody = z.infer<typeof qrRefundBodySchema>;
export type QrRefund = z.infer<typeof qrRefundSchema>;
