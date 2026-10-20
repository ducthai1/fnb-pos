import { PAYMENT_INTENT_STATUSES, type PaymentIntentStatus } from "@fnb/domain/payment";
import { z } from "zod";
import { instantSchema } from "../primitives/instant-schema";
import { wholeDongSchema } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";
import { contentCodeSchema } from "./payment-intent-payload-schemas";

/** The change feed entity, keyed by the intent's id, that tells a till what its QR got. */
export const PAYMENT_INTENT_ENTITY = "payment_intent";

const statusSchema = z
  .string()
  .refine((status): status is PaymentIntentStatus =>
    (PAYMENT_INTENT_STATUSES as readonly string[]).includes(status),
  );

/**
 * A payment intent as a till holds it. `receivedAmount` is what the matched transfer
 * brought, null until one is matched; a till shows partial or overpaid from it, and pays
 * the order with the intent only once its status is paid.
 */
export const paymentIntentSnapshotSchema = z
  .object({
    id: uuidSchema,
    orderId: uuidSchema,
    branchId: uuidSchema,
    amount: wholeDongSchema.positive(),
    contentCode: contentCodeSchema,
    status: statusSchema,
    expiresAt: instantSchema,
    receivedAmount: wholeDongSchema.positive().nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export type PaymentIntentSnapshot = z.infer<typeof paymentIntentSnapshotSchema>;
