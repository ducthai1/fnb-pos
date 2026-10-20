import { dayCloseBodySchema, dayCloseQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { closeBusinessDay } from "../../day-close/close-business-day";
import { DAY_CLOSE_ERROR_CODES as CODES } from "../../day-close/day-close-error-codes";
import { readDayStatus } from "../../day-close/day-status";
import type { EInvoiceProvider } from "../../einvoice/einvoice-provider";
import { submitBatchesNow } from "../../einvoice/einvoice-worker";
import { uuidJsonSchema } from "../../http/uuid-schema";

const params = {
  type: "object",
  required: ["branchId"],
  properties: { branchId: uuidJsonSchema },
} as const;

interface ClosedDayRow {
  id: string;
  closed_by_app_user_id: string;
  closed_at: Date;
  summary: Record<string, unknown>;
}

/**
 * Closing a branch's business day. Reading where a day stands needs view_reports. Closing it
 * also takes accept_close_difference, the key that settles a cash shift that does not add
 * up: closing the day settles every shift of it for good, and sends the day's invoice data
 * to the tax authority, so it is the same manager's call (no new key, and neither can be
 * lent on the spot in the backoffice).
 */
export function registerDayCloseRoutes(
  app: FastifyInstance,
  context: ApiContext,
  providers: ReadonlyMap<string, EInvoiceProvider>,
): void {
  const { pool, clock } = context;

  app.post<{ Params: { branchId: string } }>(
    "/branches/:branchId/day-close",
    {
      onRequest: [
        context.requireSession,
        context.requirePermission("view_reports"),
        context.requirePermission("accept_close_difference"),
      ],
      schema: { params },
    },
    async (request, reply) => {
      const body = dayCloseBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { tenantId, appUserId } = backofficeAuth(request);
      const { branchId } = request.params;
      const closing = { tenantId, branchId, appUserId, now: clock.now(), ...body.data };
      const outcome = await withTenant(pool, tenantId, (client) =>
        closeBusinessDay(client, closing),
      );
      if (!outcome.ok) return reply.code(outcome.status).send(outcome.body);
      // The day's data goes out now, so the manager sees whether it went through; what
      // fails stays queued for the worker.
      await submitBatchesNow({ pool, clock, providers }, tenantId, outcome.batchIds);
      const status = await withTenant(pool, tenantId, (client) =>
        readDayStatus(client, branchId, body.data.businessDate),
      );
      return reply.code(201).send({ dayClose: outcome.dayClose, ...status });
    },
  );

  app.get<{ Params: { branchId: string } }>(
    "/branches/:branchId/day-close",
    {
      onRequest: [context.requireSession, context.requirePermission("view_reports")],
      schema: { params },
    },
    async (request, reply) => {
      const query = dayCloseQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { branchId } = request.params;
      const { businessDate } = query.data;
      const answer = await withTenant(pool, backofficeAuth(request).tenantId, async (client) => {
        const branch = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
        if (branch.rowCount === 0) return null;
        const closed = await client.query<ClosedDayRow>(
          "SELECT id, closed_by_app_user_id, closed_at, summary FROM day_close " +
            "WHERE branch_id = $1 AND business_date = $2",
          [branchId, businessDate],
        );
        const row = closed.rows[0];
        const dayClose =
          row === undefined
            ? null
            : {
                id: row.id,
                branchId,
                businessDate,
                closedByAppUserId: row.closed_by_app_user_id,
                closedAt: row.closed_at.toISOString(),
                summary: row.summary,
              };
        return { dayClose, ...(await readDayStatus(client, branchId, businessDate)) };
      });
      if (answer === null) return reply.code(404).send({ code: CODES.branchNotFound });
      return answer;
    },
  );
}
