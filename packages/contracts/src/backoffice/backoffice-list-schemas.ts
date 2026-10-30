import { z } from "zod";
import { instantSchema } from "../primitives/instant-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/*
 * What the backoffice lists. Objects are strict: a field the contract does not name (a
 * PIN hash, a credential's token hash) is a leak to be caught where the answer is parsed,
 * not a field a screen quietly ignores.
 */

/** A branch of the organization the member signed in to, with the brand whose menu it sells. */
export const branchSummarySchema = z
  .object({ id: uuidSchema, name: z.string(), brandId: uuidSchema, brandName: z.string() })
  .strict();

/** GET /branches. */
export const branchListSchema = z.object({ branches: z.array(branchSummarySchema) }).strict();

/** GET /devices?branchId=: the branch whose tills to list. */
export const deviceListQuerySchema = z.object({ branchId: uuidSchema }).strict();

/** A till paired to a branch; revokedAt is set once it can no longer sign in. */
export const deviceSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    branchId: uuidSchema,
    pairedAt: instantSchema,
    revokedAt: instantSchema.nullable(),
  })
  .strict();

/** GET /devices?branchId=. */
export const deviceListSchema = z.object({ devices: z.array(deviceSummarySchema) }).strict();

/** Someone who signs in at the tills with a PIN, in one role, at one or more branches. */
export const staffSummarySchema = z
  .object({
    id: uuidSchema,
    displayName: z.string(),
    roleId: uuidSchema,
    active: z.boolean(),
    branchIds: z.array(uuidSchema),
    /** Until when wrong PINs keep them from signing in; null when no lock holds now. */
    lockedOutUntil: instantSchema.nullable(),
    /** Wrong PINs counted since the last right one: the next lock grows with it. */
    failedSignIns: z.number().int().nonnegative(),
    /** What a rename or a change of role must name (`?version=`), so it never overwrites a newer one. */
    version: z.number().int().min(1),
  })
  .strict();

/** GET /staff. */
export const staffListSchema = z.object({ staff: z.array(staffSummarySchema) }).strict();

export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type StaffSummary = z.infer<typeof staffSummarySchema>;
