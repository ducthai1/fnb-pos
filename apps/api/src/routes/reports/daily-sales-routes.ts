import { dailySalesQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { readDailySalesReport } from "../../reports/daily-sales-report";
import { REPORT_ERROR_CODES } from "../../reports/report-error-codes";

export function registerDailySalesRoutes(app: FastifyInstance, context: ApiContext): void {
  // The day's figures by the fixed definitions of the report contract. A branch of another
  // organization is invisible under row level security and answers 404 like a missing one.
  app.get(
    "/reports/daily-sales",
    { onRequest: [context.requireSession, context.requirePermission("view_reports")] },
    async (request, reply) => {
      const query = dailySalesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { branchId, businessDate } = query.data;
      const report = await withTenant(context.pool, backofficeAuth(request).tenantId, (client) =>
        readDailySalesReport(client, branchId, businessDate),
      );
      if (report === null) return reply.code(404).send({ code: REPORT_ERROR_CODES.branchNotFound });
      return report;
    },
  );
}
