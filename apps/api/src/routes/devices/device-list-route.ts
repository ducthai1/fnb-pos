import { type DeviceSummary, deviceListQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { DEVICE_ERROR_CODES } from "../../devices/device-error-codes";

interface DeviceRow {
  id: string;
  name: string;
  branch_id: string;
  created_at: Date;
  last_revoked_at: Date | null;
  live: boolean;
}

// A till is revoked once none of its credentials can sign in; it shows the moment the last
// one stopped. Credential rows themselves (and their token hashes) never leave this query.
const LIST_DEVICES =
  "SELECT d.id, d.name, d.branch_id, d.created_at, " +
  "(SELECT max(c.revoked_at) FROM device_credential c " +
  "WHERE c.tenant_id = d.tenant_id AND c.device_id = d.id) AS last_revoked_at, " +
  "EXISTS (SELECT 1 FROM device_credential c WHERE c.tenant_id = d.tenant_id " +
  "AND c.device_id = d.id AND c.revoked_at IS NULL) AS live " +
  "FROM device d WHERE d.branch_id = $1 ORDER BY d.created_at, d.id";

/**
 * The tills paired to one branch, revoked ones included so the list explains why a till
 * stopped working. Seeing them is part of managing them, so it takes manage_devices,
 * checked before the query is read. A branch of another tenant is invisible under row
 * level security and answers 404 like one that never existed.
 */
export function registerDeviceListRoute(app: FastifyInstance, context: ApiContext): void {
  app.get(
    "/devices",
    { onRequest: [context.requireSession, context.requirePermission("manage_devices")] },
    async (request, reply) => {
      const query = deviceListQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { branchId } = query.data;
      const rows = await withTenant(context.pool, backofficeAuth(request).tenantId, async (c) => {
        const branch = await c.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
        if (branch.rowCount === 0) return null;
        return (await c.query<DeviceRow>(LIST_DEVICES, [branchId])).rows;
      });
      if (rows === null) return reply.code(404).send({ code: DEVICE_ERROR_CODES.branchNotFound });
      const devices: DeviceSummary[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        branchId: row.branch_id,
        pairedAt: row.created_at.toISOString(),
        revokedAt:
          row.live || row.last_revoked_at === null ? null : row.last_revoked_at.toISOString(),
      }));
      return { devices };
    },
  );
}
