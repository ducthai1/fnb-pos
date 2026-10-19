import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import { claimAttempt } from "../../security/attempt-lockout";
import { hashToken, newOpaqueToken } from "../../security/opaque-token";
import { verifySecret } from "../../security/secret-hash";
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

/** Sent by the till beside its own `Authorization: Device` credential. */
export const STAFF_SESSION_HEADER = "x-staff-session";

type Gate =
  | { kind: "not-found" }
  | { kind: "not-in-branch" }
  | { kind: "locked"; lockedUntil: Date }
  | { kind: "allowed"; pinHash: string };

export function registerStaffSessionRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock, policy } = context;

  app.post<{ Body: { staffId: string; pin: string } }>(
    "/pos/staff-sessions",
    { onRequest: context.requireDevice, schema: { body: createBody } },
    async (request, reply) => {
      const device = deviceAuth(request);
      const { staffId, pin } = request.body;
      const now = clock.now();
      // The branch is checked before an attempt is counted, so a till of the wrong branch
      // can neither guess a PIN nor lock the staff member out. The row lock makes the
      // count exact under parallel attempts; the slow PIN check runs after commit.
      const gate = await withTenant(pool, device.tenantId, async (client): Promise<Gate> => {
        const found = await client.query<{
          pin_hash: string;
          pin_failed_attempts: number;
          pin_locked_until: Date | null;
          in_branch: boolean;
        }>(
          "SELECT s.pin_hash, s.pin_failed_attempts, s.pin_locked_until, EXISTS (SELECT 1 " +
            "FROM staff_branch b WHERE b.staff_id = s.id AND b.branch_id = $2) AS in_branch " +
            "FROM staff s WHERE s.id = $1 AND s.active FOR UPDATE OF s",
          [staffId, device.branchId],
        );
        const row = found.rows[0];
        if (row === undefined) return { kind: "not-found" };
        if (!row.in_branch) return { kind: "not-in-branch" };
        const state = {
          failedAttempts: row.pin_failed_attempts,
          lockedUntil: row.pin_locked_until,
        };
        const claim = claimAttempt(state, now, policy.pin);
        if (!claim.allowed) return { kind: "locked", lockedUntil: claim.lockedUntil };
        // Lockout state is not staff data: no version bump, so a till's copy of the staff
        // row does not go stale on every wrong PIN.
        await client.query(
          "UPDATE staff SET pin_failed_attempts = $2, pin_locked_until = $3 WHERE id = $1",
          [staffId, claim.next.failedAttempts, claim.next.lockedUntil],
        );
        return { kind: "allowed", pinHash: row.pin_hash };
      });
      if (gate.kind === "not-found")
        return reply.code(404).send({ code: STAFF_ERROR_CODES.staffNotFound });
      if (gate.kind === "not-in-branch")
        return reply.code(403).send({ code: STAFF_ERROR_CODES.notInBranch });
      if (gate.kind === "locked") {
        const seconds = Math.ceil((gate.lockedUntil.getTime() - now.getTime()) / 1000);
        return reply
          .code(429)
          .header("retry-after", String(seconds))
          .send({ code: STAFF_ERROR_CODES.pinLocked, lockedUntil: gate.lockedUntil.toISOString() });
      }
      if (!(await verifySecret(pin, gate.pinHash))) {
        return reply.code(401).send({ code: STAFF_ERROR_CODES.pinInvalid });
      }
      const token = newOpaqueToken();
      const expiresAt = new Date(now.getTime() + policy.staffSessionTtlMillis);
      await withTenant(pool, device.tenantId, async (client) => {
        await client.query(
          "UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1",
          [staffId],
        );
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

  // Who is working this till right now. The staff token alone proves nothing: it counts
  // only on the device it was issued to, presented with that device's live credential.
  app.get(
    "/pos/staff-sessions/current",
    { onRequest: context.requireDevice },
    async (request, reply) => {
      const device = deviceAuth(request);
      const token = request.headers[STAFF_SESSION_HEADER];
      const found =
        typeof token !== "string"
          ? undefined
          : (
              await withTenant(pool, device.tenantId, (client) =>
                client.query<{
                  staff_id: string;
                  display_name: string;
                  role_id: string;
                  expires_at: Date;
                }>(
                  "SELECT s.id AS staff_id, s.display_name, s.role_id, ss.expires_at FROM staff_session ss " +
                    "JOIN staff s ON s.tenant_id = ss.tenant_id AND s.id = ss.staff_id " +
                    "WHERE ss.token_hash = $1 AND ss.device_id = $2 AND ss.revoked_at IS NULL " +
                    "AND ss.expires_at > $3 AND s.active",
                  [hashToken(token), device.deviceId, clock.now()],
                ),
              )
            ).rows[0];
      if (found === undefined)
        return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
      return {
        staffId: found.staff_id,
        displayName: found.display_name,
        roleId: found.role_id,
        expiresAt: found.expires_at.toISOString(),
      };
    },
  );
}
