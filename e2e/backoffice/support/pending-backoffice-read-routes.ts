import type { buildApp } from "@fnb/api/build-app";
import { withTenant } from "@fnb/db";
import type pg from "pg";

type App = ReturnType<typeof buildApp>;

/*
 * Stand-ins for three small read routes the backoffice calls and the API does not have yet:
 * GET /branches, GET /devices?branchId=, GET /staff. They read the same tables under the
 * same row level security (the app role, inside withTenant) and answer in the shape the
 * backoffice expects, so the flows around them run against the real API. Once the API has
 * its own, registering these again fails the run (Fastify refuses a duplicate route): the
 * signal to delete this file.
 */

/** The tenant of the signed-in caller, asked of the API's own session check. */
async function tenantOf(app: App, cookie: string | undefined): Promise<string | null> {
  const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookie ?? "" } });
  return me.statusCode === 200 ? (me.json() as { organizationId: string }).organizationId : null;
}

const UNAUTHENTICATED = { code: "API_AUTH_UNAUTHENTICATED" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function registerPendingBackofficeReadRoutes(app: App, pool: pg.Pool): void {
  app.get("/branches", async (request, reply) => {
    const tenantId = await tenantOf(app, request.headers.cookie);
    if (tenantId === null) return reply.code(401).send(UNAUTHENTICATED);
    const { rows } = await withTenant(pool, tenantId, (client) =>
      client.query<{ id: string; name: string; brand_id: string; brand_name: string }>(
        "SELECT b.id, b.name, b.brand_id, r.name AS brand_name FROM branch b " +
          "JOIN brand r ON r.id = b.brand_id ORDER BY b.name, b.id",
      ),
    );
    return {
      branches: rows.map((row) => ({ id: row.id, name: row.name, brandId: row.brand_id, brandName: row.brand_name })),
    };
  });

  app.get<{ Querystring: { branchId?: string } }>("/devices", async (request, reply) => {
    const tenantId = await tenantOf(app, request.headers.cookie);
    if (tenantId === null) return reply.code(401).send(UNAUTHENTICATED);
    const branchId = request.query.branchId ?? "";
    if (!UUID.test(branchId)) return reply.code(400).send({ code: "API_INVALID_REQUEST" });
    const { rows } = await withTenant(pool, tenantId, (client) =>
      client.query<{ id: string; name: string; branch_id: string; created_at: Date; revoked_at: Date | null; live: boolean }>(
        "SELECT d.id, d.name, d.branch_id, d.created_at, " +
          "(SELECT max(c.revoked_at) FROM device_credential c WHERE c.device_id = d.id) AS revoked_at, " +
          "EXISTS (SELECT 1 FROM device_credential c WHERE c.device_id = d.id AND c.revoked_at IS NULL) AS live " +
          "FROM device d WHERE d.branch_id = $1 ORDER BY d.created_at, d.id",
        [branchId],
      ),
    );
    return {
      devices: rows.map((row) => ({
        id: row.id,
        name: row.name,
        branchId: row.branch_id,
        pairedAt: row.created_at.toISOString(),
        revokedAt: row.live || row.revoked_at === null ? null : row.revoked_at.toISOString(),
      })),
    };
  });

  app.get("/staff", async (request, reply) => {
    const tenantId = await tenantOf(app, request.headers.cookie);
    if (tenantId === null) return reply.code(401).send(UNAUTHENTICATED);
    const { rows } = await withTenant(pool, tenantId, (client) =>
      client.query<{ id: string; display_name: string; role_id: string; active: boolean; branch_ids: string[] }>(
        "SELECT s.id, s.display_name, s.role_id, s.active, ARRAY(SELECT sb.branch_id FROM staff_branch sb " +
          "WHERE sb.staff_id = s.id ORDER BY sb.branch_id) AS branch_ids FROM staff s ORDER BY s.display_name, s.id",
      ),
    );
    return {
      staff: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        roleId: row.role_id,
        active: row.active,
        branchIds: row.branch_ids,
      })),
    };
  });
}
