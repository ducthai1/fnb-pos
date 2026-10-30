import { z } from "zod";

/**
 * `?version=` on a route that removes or changes a row without a body of its own to carry
 * it: the version the caller last read. The row is changed only if it still has that
 * version, so nobody removes or overwrites what someone else has just edited.
 */
export const expectedVersionQuerySchema = z
  .object({ version: z.coerce.number().int().min(1).max(2_147_483_647) })
  .strict();
