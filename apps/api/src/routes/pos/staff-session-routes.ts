import { encodeRoleGrants, newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import { loadRoleGrants } from "../../permissions/role-grants-store";
import { hashToken, newOpaqueToken } from "../../security/opaque-token";
import { verifySecret } from "../../security/secret-hash";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { claimPinAttempt, clearPinAttempts, refusePinGate } from "../../staff/pin-attempt-gate";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";

const createBody = {
  type: "object",
  additionalProperties: false,
  required: ["staffId", "pin"],
  properties: {
    staffId: { type: "string", format: "uuid" },
    pin: { type: "string", maxLength: 16 },
  },
} as const;

export function registerStaffSessionRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock, policy } = context;

  app.post<{ Body: { staffId: string; pin: string } }>(
    "/pos/staff-sessions",
    { onRequest: context.requireDevice, schema: { body: createBody } },
    async (request, reply) => {
      const device = deviceAuth(request);
      const { staffId, pin } = request.body;
      const now = clock.now();
      const gate = await claimPinAttempt(pool, device, staffId, now, policy.pin);
      if (gate.kind !== "allowed") return refusePinGate(reply, gate, now);
      if (!(await verifySecret(pin, gate.pinHash))) {
        return reply.code(401).send({ code: STAFF_ERROR_CODES.pinInvalid });
      }
      const token = newOpaqueToken();
      const expiresAt = new Date(now.getTime() + policy.staffSessionTtlMillis);
      await withTenant(pool, device.tenantId, async (client) => {
        await clearPinAttempts(client, staffId);
        await client.query(
          "INSERT INTO staff_session (id, tenant_id, staff_id, device_id, token_hash, expires_at, " +
            "created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
          [newId(), device.tenantId, staffId, device.deviceId, hashToken(token), expiresAt, now],
        );
      });
      return reply
        .code(201)
        .send({ staffSessionToken: token, staffId, expiresAt: expiresAt.toISOString() });
    },
  );

  // Who is working this till right now, and what they may do. The grants let the till
  // decide on its own while offline whether an action is allowed, needs a manager's
  // approval or is refused; the server checks again when the action reaches it. They are
  // decoded and written out again, so a corrupt role fails here instead of on the till.
  app.get(
    "/pos/staff-sessions/current",
    { onRequest: context.requireDevice },
    async (request, reply) => {
      const device = deviceAuth(request);
      const found = await withTenant(pool, device.tenantId, async (client) => {
        const session = await findCurrentStaffSession(
          client,
          device,
          request.headers[STAFF_SESSION_HEADER],
          clock.now(),
        );
        if (session === undefined) return undefined;
        return { session, grants: await loadRoleGrants(client, session.roleId) };
      });
      if (found === undefined)
        return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
      const { session, grants } = found;
      return {
        staffId: session.staffId,
        displayName: session.displayName,
        roleId: session.roleId,
        expiresAt: session.expiresAt.toISOString(),
        grants: encodeRoleGrants(grants),
      };
    },
  );
}
