import { PERMISSION_KEYS } from "@fnb/domain";
import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

/**
 * GET /auth/me: who is signed in, to which organization, and which keys their role holds
 * right now. The keys let a screen hide what the member cannot use; every route still
 * checks its own key, so a stale or edited list grants nothing.
 */
export const signedInMemberSchema = z
  .object({
    accountId: uuidSchema,
    organizationId: uuidSchema,
    organizationName: z.string().nullable(),
    appUserId: uuidSchema,
    displayName: z.string().nullable(),
    permissionKeys: z.array(z.enum(PERMISSION_KEYS)),
  })
  .strict();

export type SignedInMember = z.infer<typeof signedInMemberSchema>;
