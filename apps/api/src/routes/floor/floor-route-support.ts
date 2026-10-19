import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodType, ZodTypeDef } from "zod";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import type { CatalogWriteContext } from "../../catalog/catalog-row-writes";
import { FLOOR_API_ERROR_CODES } from "./floor-api-error-codes";

/** Thrown inside a floor transaction so it rolls back, then answered as { code }. */
export class FloorRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "FloorRequestError";
  }
}

const UNIQUE_VIOLATION = "23505";

/**
 * Reading the floor plan needs a signed-in member; changing it needs manage_settings,
 * checked before the body is parsed, so a refusal says nothing about the request.
 */
export function floorGates(context: ApiContext) {
  return {
    read: { onRequest: context.requireSession },
    write: { onRequest: [context.requireSession, context.requirePermission("manage_settings")] },
  };
}

/** A floor route body; any failure it throws is answered as { code } by one mapping. */
export function floorHandler(
  work: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await work(request, reply);
    } catch (error) {
      if (error instanceof FloorRequestError) {
        return reply.code(error.status).send({ code: error.code });
      }
      // A create naming an id another row already has: refused rather than overwritten.
      if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) {
        return reply.code(409).send({ code: FLOOR_API_ERROR_CODES.idConflict });
      }
      throw error;
    }
  };
}

/** The input parsed by `schema`, or a 400 with the generic validation code. */
export function parseOrReject<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new FloorRequestError(400, AUTH_ERROR_CODES.invalidRequest);
  return result.data;
}

/** The signed-in caller as the writer of floor rows, stamped with the API clock. */
export function floorWriterOf(request: FastifyRequest, context: ApiContext): CatalogWriteContext {
  const caller = backofficeAuth(request);
  return { tenantId: caller.tenantId, appUserId: caller.appUserId, now: context.clock.now() };
}

/** The version check every floor write makes on the row it locked. */
export function refuseStaleOrArchived(
  stored: { version: number; archived_at: Date | null },
  expectedVersion: number | null,
): void {
  if (expectedVersion !== stored.version) {
    throw new FloorRequestError(409, FLOOR_API_ERROR_CODES.versionConflict);
  }
  if (stored.archived_at !== null) throw new FloorRequestError(409, FLOOR_API_ERROR_CODES.archived);
}
