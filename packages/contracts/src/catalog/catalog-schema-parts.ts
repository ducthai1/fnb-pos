import { z } from "zod";
import { instantSchema } from "../primitives/instant-schema";
import { wholeDongSchema } from "../primitives/money-schema";

/*
 * Shapes shared by the catalog bodies. They check form only (types, ids, sizes); the
 * business rules (limits in order, no negative price, reachable minimums, which rates
 * exist) are the domain's, so a client gets the domain's precise code instead of a
 * generic validation failure. That is also why amounts and rates stay plain integers
 * here rather than the converting money and rate schemas.
 */

/**
 * Zod's uuid check, which also accepts uppercase. Tightening it to uuidSchema would refuse
 * requests the menu API accepts today, so that is a change of its own, not a side effect.
 */
export const idSchema = z.string().uuid();
export const nameSchema = z.string().trim().min(1).max(120);
export const amountSchema = wholeDongSchema;
export const countSchema = z.number().int().safe();
export const versionSchema = z.number().int().positive().nullable();
export const channelKeySchema = z.string().trim().min(1).max(40);
export { instantSchema };

export const idParamsSchema = z.object({ id: idSchema });
export const brandQuerySchema = z.object({ brandId: idSchema });
export const branchQuerySchema = z.object({ branchId: idSchema });
