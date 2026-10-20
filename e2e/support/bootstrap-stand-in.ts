import { createHash } from "node:crypto";
import type { buildApp } from "@fnb/api/build-app";
import { withTenant } from "@fnb/db";
import type pg from "pg";

const DEVICE_HEADER =
  /^Device ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\S+)$/;

// TO REMOVE AFTER MERGE: GET /pos/bootstrap is being added to the API on another branch at
// the same time as the POS. Until it lands here, the e2e server answers it with the minimum
// the POS reads (branch, staff, cursor), checking the till's credential the way the API's
// device hook does. It is registered only while the API has no such route, so once the real
// endpoint is merged it takes over by itself; then delete this file and its one call.
export function addBootstrapStandIn(app: ReturnType<typeof buildApp>, pool: pg.Pool): void {
  if (app.hasRoute({ method: "GET", url: "/pos/bootstrap" })) return;
  app.get("/pos/bootstrap", async (request, reply) => {
    const presented = DEVICE_HEADER.exec(request.headers.authorization ?? "");
    const tenantId = presented?.[1];
    if (presented === null || tenantId === undefined) {
      return reply.code(401).send({ code: "API_DEVICE_UNAUTHENTICATED" });
    }
    const tokenHash = createHash("sha256").update(`${tenantId}.${presented[2]}`).digest("hex");
    const answer = await withTenant(pool, tenantId, async (client) => {
      const device = await client.query<{ branch_id: string; branch_name: string }>(
        "SELECT d.branch_id, b.name AS branch_name FROM device_credential c " +
          "JOIN device d ON d.tenant_id = c.tenant_id AND d.id = c.device_id " +
          "JOIN branch b ON b.tenant_id = d.tenant_id AND b.id = d.branch_id " +
          "WHERE c.token_hash = $1 AND c.revoked_at IS NULL",
        [tokenHash],
      );
      const place = device.rows[0];
      if (place === undefined) return null;
      const staff = await client.query<{ id: string; display_name: string }>(
        "SELECT s.id, s.display_name FROM staff s JOIN staff_branch sb ON sb.staff_id = s.id " +
          "WHERE sb.branch_id = $1 ORDER BY s.display_name",
        [place.branch_id],
      );
      return {
        branch: { id: place.branch_id, name: place.branch_name },
        staff: staff.rows.map((row) => ({ id: row.id, displayName: row.display_name })),
        cursor: "0",
      };
    });
    if (answer === null) return reply.code(401).send({ code: "API_DEVICE_UNAUTHENTICATED" });
    return reply.send(answer);
  });
}
