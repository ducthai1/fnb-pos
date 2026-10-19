import { withTenant } from "@fnb/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { hashToken } from "../security/opaque-token";
import { DEVICE_ERROR_CODES } from "./device-error-codes";
import { readDeviceToken } from "./device-token";

/** The paired till making the request. Its routes run in withTenant(tenantId). */
export interface DeviceAuth {
  deviceId: string;
  tenantId: string;
  branchId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    device: DeviceAuth | null;
  }
}

/** onRequest hook for till routes: a credential that exists and is not revoked, or 401. */
export function deviceAuthHook(pool: pg.Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const presented = readDeviceToken(request.headers.authorization);
    const found =
      presented === null
        ? undefined
        : (
            await withTenant(pool, presented.tenantId, (client) =>
              client.query<{ device_id: string; branch_id: string }>(
                "SELECT c.device_id, d.branch_id FROM device_credential c " +
                  "JOIN device d ON d.tenant_id = c.tenant_id AND d.id = c.device_id " +
                  "WHERE c.token_hash = $1 AND c.revoked_at IS NULL",
                [hashToken(presented.token)],
              ),
            )
          ).rows[0];
    if (presented === null || found === undefined) {
      return reply.code(401).send({ code: DEVICE_ERROR_CODES.unauthenticated });
    }
    request.device = {
      deviceId: found.device_id,
      tenantId: presented.tenantId,
      branchId: found.branch_id,
    };
  };
}

/** The till calling a route behind deviceAuthHook. */
export function deviceAuth(request: FastifyRequest): DeviceAuth {
  if (request.device === null) throw new Error("route is missing deviceAuthHook");
  return request.device;
}
