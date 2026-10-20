import type { FastifyReply, FastifyRequest } from "fastify";

export const HTTP_ERROR_CODES = {
  /** A browser page of a site the server was not told about tried to change something. */
  originNotAllowed: "API_ORIGIN_NOT_ALLOWED",
} as const;

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * onRequest hook refusing writes sent by a browser page of another site. The session
 * cookie's SameSite=Lax already keeps it off cross-site POSTs; this is the second lock, for
 * an old browser or a sibling subdomain the cookie rules treat as same-site. Browsers send
 * Origin on every cross-origin request and every POST, and a page cannot forge it. Requests
 * without one (a bank's webhook, a till's native shell, a script) are not from a page and
 * are left to their own authentication.
 */
export function allowedOriginsHook(origins: readonly string[]) {
  const allowed = new Set(origins);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (READ_ONLY_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin === undefined || allowed.has(origin)) return;
    return reply.code(403).send({ code: HTTP_ERROR_CODES.originNotAllowed });
  };
}
