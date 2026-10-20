import { instantSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { uuidJsonSchema } from "../../http/uuid-schema";
import { readPrintFailures } from "../../reports/print-failures-query";
import { REPORT_ERROR_CODES } from "../../reports/report-error-codes";

interface PrintFailuresQuery {
  branchId: string;
  from: string;
  to: string;
}

const querystring = {
  type: "object",
  required: ["branchId", "from", "to"],
  additionalProperties: false,
  properties: { branchId: uuidJsonSchema, from: { type: "string" }, to: { type: "string" } },
} as const;

export function registerPrintFailureRoutes(app: FastifyInstance, context: ApiContext): void {
  // Slips the branch's tills could not print and never printed since: the bills a guest
  // left without, the tickets the kitchen never got. A branch of another organization is
  // invisible under row level security, so it answers 404 like one that never existed.
  app.get<{ Querystring: PrintFailuresQuery }>(
    "/reports/print-failures",
    {
      onRequest: [context.requireSession, context.requirePermission("view_reports")],
      schema: { querystring },
    },
    async (request, reply) => {
      const { branchId, from, to } = request.query;
      // Instants with an offset only: a bare local time would be read in the server's zone.
      const window = [instantSchema.safeParse(from), instantSchema.safeParse(to)];
      if (!window.every((parsed) => parsed.success)) {
        return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      }
      if (Date.parse(from) >= Date.parse(to)) {
        return reply.code(400).send({ code: REPORT_ERROR_CODES.invalidRange });
      }
      const auth = backofficeAuth(request);
      const answer = await withTenant(context.pool, auth.tenantId, async (client) => {
        const branch = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
        if (branch.rowCount === 0) return null;
        return readPrintFailures(client, { branchId, from, to });
      });
      if (answer === null) {
        return reply.code(404).send({ code: REPORT_ERROR_CODES.branchNotFound });
      }
      return answer;
    },
  );
}
