import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";
import { einvoiceBuyerSchema } from "./einvoice-buyer-schema";

/**
 * order.set_buyer_info: what the customer wants on their invoice, sent before it is issued
 * (usually before the order is paid, while they stand at the counter). null takes back
 * details given earlier, so the invoice goes to a retail customer again.
 */
export const setBuyerInfoPayloadSchema = z
  .object({ orderId: uuidSchema, buyer: einvoiceBuyerSchema.nullable() })
  .strict();

export type SetBuyerInfoPayload = z.output<typeof setBuyerInfoPayloadSchema>;

export const EINVOICE_STATUSES = [
  "pending",
  "issued",
  "failed_retryable",
  "failed_permanent",
] as const;

export const einvoiceStatusSchema = z.enum(EINVOICE_STATUSES);

export type EInvoiceStatus = z.infer<typeof einvoiceStatusSchema>;

/**
 * The invoice of an order, as the order's snapshot carries it once one exists, so a till can
 * reprint the bill with the lookup code and its QR. Buyer details stay on the server: the
 * change feed is kept for good and copied to every till of the branch.
 */
export const orderEInvoiceSnapshotSchema = z
  .object({
    id: uuidSchema,
    status: einvoiceStatusSchema,
    number: z.string().nullable(),
    templateSymbol: z.string(),
    taxAuthorityCode: z.string().nullable(),
    lookupCode: z.string().nullable(),
    lookupUrl: z.string().nullable(),
  })
  .strict();

export type OrderEInvoiceSnapshot = z.infer<typeof orderEInvoiceSnapshotSchema>;
