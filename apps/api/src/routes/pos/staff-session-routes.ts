import { encodeRoleGrants, newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import { loadRoleGrants } from "../../permissions/role-grants-store";
import { hashToken, newOpaqueToken } from "../../security/opaque-token";
import { lockActiveStaff } from "../../staff/active-staff-lock";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { claimPinAttempt, clearPinAttempts, refusePinGate } from "../../staff/pin-attempt-gate";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import { uuidJsonSchema } from "../../http/uuid-schema";

const createBody = {
  type: "object",
  additionalProperties: false,
  required: ["staffId", "pin"],
  properties: {
    staffId: uuidJsonSchema,
    pin: { type: "string", maxLength: 16 },
  },
} as const;

export function registerStaffSessionRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock, policy, verifySecret } = context;

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
      const sessionId = newId();
      const expiresAt = new Date(now.getTime() + policy.staffSessionTtlMillis);
      const opened = await withTenant(pool, device.tenantId, async (client) => {
        // Locked out while the PIN was checked: no session, or reactivating would revive it.
        if ((await lockActiveStaff(client, staffId)) === null) return false;
        await clearPinAttempts(client, staffId, gate.claimedAttempts);
        await client.query(
          "INSERT INTO staff_session (id, tenant_id, staff_id, device_id, token_hash, expires_at, " +
            "created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
          [sessionId, device.tenantId, staffId, device.deviceId, hashToken(token), expiresAt, now],
        );
        return true;
      });
      if (!opened) return reply.code(404).send({ code: STAFF_ERROR_CODES.staffNotFound });
      // The session's id is no secret: the till stamps it on every command it records, so
      // commands of a cashier who handed over offline are pushed under their own session.
      return reply.code(201).send({
        staffSessionToken: token,
        staffSessionId: sessionId,
        staffId,
        expiresAt: expiresAt.toISOString(),
      });
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

  // Signing out at the till. Ends only the session the till presents, and only on the till
  // it was issued to; a session that is already over (or never was) answers the same, so a
  // till that signs out twice, or after the session expired, learns nothing it can probe.
  app.delete(
    "/pos/staff-sessions/current",
    { onRequest: context.requireDevice },
    async (request) => {
      const device = deviceAuth(request);
      const token = request.headers[STAFF_SESSION_HEADER];
      if (typeof token !== "string") return { ended: false };
      const now = clock.now();
      const ended = await withTenant(pool, device.tenantId, async (client) => {
        const result = await client.query(
          "UPDATE staff_session SET revoked_at = $3, updated_at = $3 WHERE token_hash = $1 " +
            "AND device_id = $2 AND revoked_at IS NULL AND expires_at > $3",
          [hashToken(token), device.deviceId, now],
        );
        return (result.rowCount ?? 0) > 0;
      });
      return { ended };
    },
  );
}
