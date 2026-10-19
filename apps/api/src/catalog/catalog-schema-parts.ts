import { z } from "zod";
import { UUID_REGEX } from "../http/uuid-schema";

/*
 * Shapes shared by the catalog bodies. They check form only (types, ids, sizes); the
 * business rules (limits in order, no negative price, reachable minimums) are the domain's,
 * so a client gets the domain's precise code instead of a generic validation failure.
 */

export const idSchema = z.string().regex(UUID_REGEX);
export const nameSchema = z.string().trim().min(1).max(120);
/** Whole đồng as a JSON number; amounts stay far below 2^53, so no precision is lost. */
export const amountSchema = z.number().int().safe();
export const countSchema = z.number().int().safe();
export const versionSchema = z.number().int().positive().nullable();
export const channelKeySchema = z.string().trim().min(1).max(40);
export const instantSchema = z.string().datetime({ offset: true });

export const idParamsSchema = z.object({ id: idSchema });
export const brandQuerySchema = z.object({ brandId: idSchema });
export const branchQuerySchema = z.object({ branchId: idSchema });
