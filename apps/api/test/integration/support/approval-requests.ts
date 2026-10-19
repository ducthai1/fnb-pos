import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";

/** POST /pos/approvals from a till, as the staff member of `staffToken` asking. */
export async function requestApproval(
  app: FastifyInstance,
  deviceToken: string,
  staffToken: string | undefined,
  body: object,
) {
  const response = await app.inject({
    method: "POST",
    url: "/pos/approvals",
    headers: {
      authorization: `Device ${deviceToken}`,
      ...(staffToken === undefined ? {} : { "x-staff-session": staffToken }),
    },
    payload: body,
  });
  return { status: response.statusCode, body: response.json() };
}

/** Every approval of the tenant, oldest first. */
export async function approvalsOf(pool: pg.Pool, tenantId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const result = await client.query(
      "SELECT id, action_key, requested_by_staff_id, approved_by_staff_id, device_id, branch_id, " +
        "payload FROM approval_log ORDER BY id",
    );
    return result.rows;
  });
}
