import { isDomainError } from "@fnb/domain";
import type { FastifyReply } from "fastify";
import type { ZodType, ZodTypeDef } from "zod";
import { AUTH_ERROR_CODES } from "../auth/auth-error-codes";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";

/** Thrown inside a catalog transaction so it rolls back, then answered as { code }. */
export class CatalogRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "CatalogRequestError";
  }
}

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

/** The body or params parsed by `schema`, or a 400 with the generic validation code. */
export function parseOrReject<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CatalogRequestError(400, AUTH_ERROR_CODES.invalidRequest);
  return result.data;
}

/**
 * Answers the failures a catalog write can end in. A foreign key failure means a row the
 * body names is not in this tenant (other tenants' rows are invisible, so it reads as
 * missing); a unique failure on a primary key means a client reused an id that is taken.
 * Anything else is rethrown to the generic 500 handler.
 */
export function replyWithCatalogError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof CatalogRequestError) {
    return reply.code(error.status).send({ code: error.code });
  }
  if (isDomainError(error)) return reply.code(400).send({ code: error.code });
  const sqlState = (error as { code?: unknown }).code;
  if (sqlState === FOREIGN_KEY_VIOLATION) {
    return reply.code(404).send({ code: CATALOG_API_ERROR_CODES.referenceNotFound });
  }
  if (sqlState === UNIQUE_VIOLATION) {
    return reply.code(409).send({ code: CATALOG_API_ERROR_CODES.idConflict });
  }
  throw error;
}

export const isForeignKeyViolation = (error: unknown): boolean =>
  (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION;
