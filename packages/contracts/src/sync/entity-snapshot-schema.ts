import { z } from "zod";

/**
 * A whole row as the server holds it after a change, in its API shape. A till replaces
 * its copy with it rather than replaying a diff, so a missed or repeated change can never
 * leave a half-updated row; each entity's own contract checks the fields.
 */
export const entitySnapshotSchema = z.record(z.string(), z.unknown());

export type EntitySnapshot = z.infer<typeof entitySnapshotSchema>;

/** An error code as the API answers it ("API_…", "DOMAIN_…"), so a till can map it to a message. */
export const errorCodeSchema = z
  .string()
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/, { message: "not an error code" });
