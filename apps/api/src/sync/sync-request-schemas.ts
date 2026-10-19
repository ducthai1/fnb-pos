import { z } from "zod";
import {
  amountSchema,
  channelKeySchema,
  idSchema,
  instantSchema,
} from "../catalog/catalog-schema-parts";
import type { SyncCommandEnvelope } from "./sync-wire-types";

/** A real calendar day: "2026-02-30" would pass a pattern and then fail in Postgres. */
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => new Date(`${day}T00:00:00Z`).toISOString().startsWith(day));

// Envelopes are not strict: a newer till may send fields this server does not know yet,
// and refusing the whole batch for that would stall its sync. The payload is checked per
// command type later, so a bad payload becomes a stored rejection of that one command.
const envelopeSchema = z.object({
  commandId: idSchema,
  deviceSeq: z.number().int().positive().safe(),
  type: z.string().min(1).max(64),
  payload: z.unknown(),
  staffSessionId: idSchema.optional(),
  approvalId: idSchema.optional(),
  businessDate: businessDateSchema,
  domainVersion: z.string().max(32),
  createdAt: instantSchema,
});

export const syncCommandBatchSchema = z.object({
  commands: z.array(envelopeSchema).min(1).max(100),
});

export const syncChangesQuerySchema = z.object({
  // A bigint cursor as decimal text, compared by Postgres as a number.
  cursor: z
    .string()
    .regex(/^(0|[1-9]\d{0,17})$/)
    .default("0"),
  limit: z.coerce.number().int().min(1).max(1_000).default(500),
});

const modifierSelectionSchema = z.object({
  groupId: idSchema,
  optionId: idSchema,
  quantity: z.number().int().min(1).max(99),
});

/**
 * What the cashier chose, never what it costs: any price the till sends along (it shows
 * one on screen) is stripped here, and the server prices the line from its catalog.
 */
const lineIntentSchema = z.object({
  lineId: idSchema,
  productId: idSchema,
  variantId: idSchema.nullable(),
  modifiers: z.array(modifierSelectionSchema).max(50),
  quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
  note: z.string().max(500).nullable(),
});

export const saveDraftPayloadSchema = z.object({
  orderId: idSchema,
  /** The till's own running number for the order, printed before it ever syncs. */
  deviceOrderNo: z.number().int().positive().safe(),
  serviceType: z.enum(["dine_in", "takeaway", "delivery_self", "delivery_platform"]),
  channelKey: channelKeySchema.nullable(),
  lines: z.array(lineIntentSchema).max(200),
});

export type SaveDraftPayload = z.infer<typeof saveDraftPayloadSchema>;

export const payOrderPayloadSchema = z.object({
  orderId: idSchema,
  payments: z
    .array(
      z.object({
        method: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
        amount: amountSchema.nonnegative(),
      }),
    )
    .min(1)
    .max(10),
  /** What the till asked the customer for; the server compares it with its own total. */
  expectedAmountDue: amountSchema,
});

export type PayOrderPayload = z.infer<typeof payOrderPayloadSchema>;

/** The batch's commands as the protocol types them, optional fields left out when absent. */
export function envelopesOf(batch: z.infer<typeof syncCommandBatchSchema>): SyncCommandEnvelope[] {
  return batch.commands.map(({ staffSessionId, approvalId, payload, ...required }) => ({
    ...required,
    payload,
    ...(staffSessionId === undefined ? {} : { staffSessionId }),
    ...(approvalId === undefined ? {} : { approvalId }),
  }));
}
