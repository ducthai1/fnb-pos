import type { BranchSummary } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";

/**
 * The branches of the organization the member signed in to. Every page of the backoffice
 * is about one branch and starts by asking which there are, so a session is enough: a
 * member without any key still needs to pick a branch to see what they are allowed to.
 * Row level security keeps it to the session's tenant; names are no secret inside it.
 */
export function registerBranchListRoute(app: FastifyInstance, context: ApiContext): void {
  app.get("/branches", { onRequest: context.requireSession }, async (request) => {
    const { tenantId } = backofficeAuth(request);
    const { rows } = await withTenant(context.pool, tenantId, (client) =>
      client.query<{ id: string; name: string; brand_id: string; brand_name: string }>(
        "SELECT b.id, b.name, b.brand_id, r.name AS brand_name FROM branch b " +
          "JOIN brand r ON r.tenant_id = b.tenant_id AND r.id = b.brand_id ORDER BY b.name, b.id",
      ),
    );
    const branches: BranchSummary[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      brandId: row.brand_id,
      brandName: row.brand_name,
    }));
    return { branches };
  });
}
