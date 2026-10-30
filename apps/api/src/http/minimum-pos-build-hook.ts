import {
  POS_BUILD_HEADER,
  POS_RELEASE_TOO_OLD_CODE,
  POS_RELEASE_TOO_OLD_STATUS,
} from "@fnb/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

/** The build a till named, or null when it named none or something that is not a build. */
export function posBuildOf(request: FastifyRequest): number | null {
  const named = request.headers[POS_BUILD_HEADER];
  if (typeof named !== "string" || !/^[0-9]{1,15}$/.test(named)) return null;
  return Number(named);
}

/**
 * onRequest hook for the sync endpoints: a till whose build is below `minimum` is answered
 * 426 with a code of its own, so its commands stay in its outbox (an HTTP failure, never a
 * refused command that would land in "needs attention") and go again after the update. A
 * till that names no build passes: builds from before the header cannot understand the
 * refusal, and the server keeps taking the build before the current one. Run after the
 * credential check, so a revoked till hears that first.
 */
export function minimumPosBuildHook(minimum: number | null) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (minimum === null) return;
    const build = posBuildOf(request);
    if (build !== null && build < minimum) {
      return reply.code(POS_RELEASE_TOO_OLD_STATUS).send({ code: POS_RELEASE_TOO_OLD_CODE });
    }
  };
}
