import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

/** PATCH /staff/:id: a new name, a new role, or both; nothing else about them changes here. */
export const staffUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    roleId: uuidSchema.optional(),
  })
  .strict()
  .refine((body) => body.displayName !== undefined || body.roleId !== undefined, {
    message: "nothing to change",
  });

/**
 * PUT /staff/:id/pin: the PIN they sign in with from now on. Only the length is bounded
 * here: whether it is 4–6 digits and hard enough to guess is the server's rule, which
 * answers with its own codes.
 */
export const staffPinBodySchema = z.object({ pin: z.string().max(16) }).strict();

/** Who holds a role: the body of the 409 a role still in use is refused archiving with. */
export const roleHoldersSchema = z
  .object({
    code: z.literal("API_ROLE_IN_USE"),
    staff: z.array(
      z.object({ id: uuidSchema, displayName: z.string(), active: z.boolean() }).strict(),
    ),
    members: z.array(
      z.object({ id: uuidSchema, displayName: z.string(), status: z.string() }).strict(),
    ),
  })
  .strict();

export type StaffUpdateBody = z.infer<typeof staffUpdateBodySchema>;
export type StaffPinBody = z.infer<typeof staffPinBodySchema>;
export type RoleHolders = z.infer<typeof roleHoldersSchema>;
