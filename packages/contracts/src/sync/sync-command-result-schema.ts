import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";
import { entitySnapshotSchema, errorCodeSchema } from "./entity-snapshot-schema";

/**
 * The server's answer to one command, kept and answered again for a repeated commandId.
 * - accepted: applied; the snapshot, when there is one, is the row it produced.
 * - rejected: final; it needs a code to tell the cashier why, and may carry the row as the
 *   server has it so the till can put its copy right.
 * - retry: not applied yet and safe to send again (an earlier deviceSeq has not arrived).
 */
export const syncCommandResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("accepted"),
      snapshot: entitySnapshotSchema.optional(),
    })
    .strict(),
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("rejected"),
      code: errorCodeSchema,
      snapshot: entitySnapshotSchema.optional(),
    })
    .strict(),
  z
    .object({
      commandId: uuidSchema,
      status: z.literal("retry"),
      code: errorCodeSchema.optional(),
    })
    .strict(),
]);

export type SyncCommandResult = z.infer<typeof syncCommandResultSchema>;
export type SyncCommandStatus = SyncCommandResult["status"];
