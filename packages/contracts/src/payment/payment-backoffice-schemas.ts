import { z } from "zod";
import { instantSchema } from "../primitives/instant-schema";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";
import { paymentIntentSnapshotSchema } from "./payment-intent-snapshot-schema";

/** GET /payments/unmatched: the branch whose unclaimed transfers to list. */
export const unmatchedPaymentsQuerySchema = z.object({ branchId: uuidSchema }).strict();

/** POST /payments/match: a person says this transfer is the money for this QR. */
export const matchPaymentBodySchema = z
  .object({ transactionId: uuidSchema, intentId: uuidSchema })
  .strict();

/**
 * PUT /payments/webhook-secrets/:branchId/:gateway: the secret the branch's gateway signs
 * its notices with (SePay's API key, PayOS's checksum key). Long enough not to be guessed;
 * printable without spaces, since it travels in a header.
 */
export const webhookSecretBodySchema = z
  .object({ secret: z.string().regex(/^[\x21-\x7e]{16,256}$/) })
  .strict();

/** A transfer into the branch's account that no QR has claimed. */
export const unmatchedTransferSchema = z
  .object({
    id: uuidSchema,
    gateway: z.string(),
    amount: wholeDongSchema.positive(),
    content: z.string(),
    occurredAt: instantSchema,
    receivedAt: instantSchema,
  })
  .strict();

/**
 * What a person matches by hand: unclaimed transfers, and the QRs of open orders still
 * waiting for one. `refundDue` is money the bank brought that no order counts (a QR paid
 * short or over, or paid for an order that closed another way): the customer is owed it.
 */
export const unmatchedPaymentsSchema = z
  .object({
    transfers: z.array(unmatchedTransferSchema),
    openIntents: z.array(paymentIntentSnapshotSchema),
    refundDue: z.array(paymentIntentSnapshotSchema),
  })
  .strict();

export type UnmatchedTransfer = z.infer<typeof unmatchedTransferSchema>;
export type UnmatchedPayments = z.infer<typeof unmatchedPaymentsSchema>;
