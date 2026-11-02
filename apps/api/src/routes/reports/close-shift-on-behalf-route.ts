import { closeShiftOnBehalfBodySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { closeShiftOnBehalf } from "../../day-close/close-shift-on-behalf";
import { uuidJsonSchema } from "../../http/uuid-schema";

const params = {
  type: "object",
  required: ["shiftId"],
  properties: { shiftId: uuidJsonSchema },
} as const;

/**
 * Closing the shift of a revoked till from the backoffice. It takes the keys that close the
 * business day (view_reports and accept_close_difference): it exists to let the day close,
 * and it settles a count whatever its difference, which is that key's call. A shift of
 * another tenant is invisible under row level security and answers 404.
 */
export function registerCloseShiftOnBehalfRoute(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;
  app.post<{ Params: { shiftId: string } }>(
    "/shifts/:shiftId/close-on-behalf",
    {
      onRequest: [
        context.requireSession,
        context.requirePermission("view_reports"),
        context.requirePermission("accept_close_difference"),
      ],
      schema: { params },
    },
    async (request, reply) => {
      const body = closeShiftOnBehalfBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { tenantId, appUserId } = backofficeAuth(request);
      const outcome = await withTenant(pool, tenantId, (client) =>
        closeShiftOnBehalf(client, {
          tenantId,
          appUserId,
          shiftId: request.params.shiftId,
          now: clock.now(),
          ...body.data,
        }),
      );
      if (!outcome.ok) return reply.code(outcome.status).send({ code: outcome.code });
      return outcome.closed;
    },
  );
}
