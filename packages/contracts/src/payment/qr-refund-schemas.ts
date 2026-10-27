import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";
import { instantSchema } from "../primitives/instant-schema";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/**
 * How money no sale counts went back to the customer: cash out of an open shift's drawer
 * (which that shift then expects less of), cash from outside any drawer, or sent back.
 */
export const QR_REFUND_METHODS = ["cash_from_drawer", "cash", "bank_transfer"] as const;

/** The reason on the drawer's cash move when a manager hands QR money back from it. */
export const QR_MONEY_HANDED_BACK_REASON = "Trả lại tiền QR cho khách";
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
    /** The open shift whose drawer the cash came out of: named exactly when it did. */
    fromShiftId: uuidSchema.optional(),
  })
  .strict()
  .refine((body) => (body.method === "cash_from_drawer") === (body.fromShiftId !== undefined), {
    path: ["fromShiftId"],
    message: "a drawer is named exactly when the cash came out of one",
  });

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
    /** Handed back once its business day was closed: beside that day's figures, not in. */
    afterDayClose: z.boolean().optional(),
  })
  .strict();

export type QrRefundBody = z.infer<typeof qrRefundBodySchema>;
export type QrRefund = z.infer<typeof qrRefundSchema>;
