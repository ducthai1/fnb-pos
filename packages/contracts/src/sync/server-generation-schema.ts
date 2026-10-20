import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

/**
 * The response header naming the server's generation: drawn when its database was made and
 * drawn again after every restore from backup. Sent on every sync answer and the bootstrap.
 * A header rather than a body field: pages and the bootstrap are strict contracts, and
 * tills already in shops would refuse a field they do not know.
 */
export const SERVER_GENERATION_HEADER = "x-fnb-server-generation";

export const serverGenerationSchema = uuidSchema;

/**
 * What the server holds of the asking till: its generation, and the device_seq of the last
 * command of this till its ledger has (0 for none). Commands it numbered later are ones
 * the server never took or lost in a restore. Unknown fields are dropped, not refused, so
 * a newer server can say more without stalling older tills.
 */
export const syncDeviceStateSchema = z.object({
  serverGeneration: serverGenerationSchema,
  lastDeviceSeq: z.number().int().nonnegative().safe(),
});

export type SyncDeviceState = z.infer<typeof syncDeviceStateSchema>;
