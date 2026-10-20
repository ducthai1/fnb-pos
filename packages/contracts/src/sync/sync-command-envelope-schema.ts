import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";
import { instantSchema } from "../primitives/instant-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/** "order.add_line", "cash.move": lowercase words joined by dots or underscores. */
export const syncCommandTypeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, { message: "not a command type" });

/**
 * One command a till recorded offline, as it is sent from the outbox. The device is the
 * authenticated caller, never a field, so a till cannot send commands as another one.
 */
export const syncCommandEnvelopeSchema = z
  .object({
    /** Made on the till when the command is recorded; sending it again changes nothing. */
    commandId: uuidSchema,
    /** The till's own counter from 1: the server applies a till's commands in this order. */
    deviceSeq: z.number().int().safe().min(1),
    type: syncCommandTypeSchema,
    /** Checked by the contract of `type` once the server knows which command it is. */
    payload: z.record(z.string(), z.unknown()),
    staffSessionId: uuidSchema.optional(),
    /** A manager's on-the-spot approval the command relies on. */
    approvalId: uuidSchema.optional(),
    businessDate: businessDateSchema,
    /*
     * Any short string: whether the version is well formed and still accepted is the
     * domain version policy's call, so a stale or broken till gets one answer for both.
     */
    domainVersion: z.string().min(1).max(32),
    /** The till's clock when the command was recorded; kept for audit, never trusted for order. */
    createdAt: instantSchema,
    /**
     * Only on a command sent again after a restore: the server generation that took it
     * first and then lost it in the restore. The server notes the resend in its audit.
     */
    resentFromGeneration: uuidSchema.optional(),
  })
  .strict();

export type SyncCommandEnvelope = z.infer<typeof syncCommandEnvelopeSchema>;
