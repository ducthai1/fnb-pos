import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { deviceAuth } from "../../devices/device-auth-hook";
import { DEVICE_ERROR_CODES } from "../../devices/device-error-codes";

const deviceParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export function registerDeviceRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;

  // Revokes every credential of the device. A device of another tenant is invisible
  // under row level security, so it answers 404 exactly like an id that never existed.
  app.post<{ Params: { id: string } }>(
    "/devices/:id/revoke",
    { onRequest: context.requireSession, schema: { params: deviceParams } },
    async (request, reply) => {
      const auth = backofficeAuth(request);
      const now = clock.now();
      const found = await withTenant(pool, auth.tenantId, async (client) => {
        const device = await client.query("SELECT 1 FROM device WHERE id = $1", [
          request.params.id,
        ]);
        if (device.rowCount === 0) return false;
        await client.query(
          "UPDATE device_credential SET revoked_at = $2, updated_at = $2, version = version + 1 " +
            "WHERE device_id = $1 AND revoked_at IS NULL",
          [request.params.id, now],
        );
        return true;
      });
      if (!found) return reply.code(404).send({ code: DEVICE_ERROR_CODES.deviceNotFound });
      return reply.code(204).send();
    },
  );

  // What a till checks on start-up: is it still paired, and to which branch.
  app.get("/devices/me", { onRequest: context.requireDevice }, async (request) => {
    const device = deviceAuth(request);
    const result = await withTenant(pool, device.tenantId, (client) =>
      client.query<{ name: string }>("SELECT name FROM device WHERE id = $1", [device.deviceId]),
    );
    return {
      deviceId: device.deviceId,
      branchId: device.branchId,
      name: result.rows[0]?.name ?? null,
    };
  });
}
