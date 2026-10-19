import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { DEVICE_ERROR_CODES } from "../../devices/device-error-codes";
import { newDeviceToken } from "../../devices/device-token";
import { newPairingCode, normalizePairingCode } from "../../devices/pairing-code";
import { hashToken } from "../../security/opaque-token";

const createCodeBody = {
  type: "object",
  additionalProperties: false,
  required: ["branchId"],
  properties: { branchId: { type: "string", format: "uuid" } },
} as const;

const pairBody = {
  type: "object",
  additionalProperties: false,
  required: ["code", "deviceName"],
  properties: {
    code: { type: "string", maxLength: 32 },
    deviceName: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
  },
} as const;

const UNIQUE_VIOLATION = "23505";
const CODE_DRAWS = 3;

export function registerPairingRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;

  app.post<{ Body: { branchId: string } }>(
    "/devices/pairing-codes",
    {
      onRequest: [context.requireSession, context.requirePermission("manage_devices")],
      schema: { body: createCodeBody },
    },
    async (request, reply) => {
      const auth = backofficeAuth(request);
      const { branchId } = request.body;
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + context.policy.pairingCodeTtlMillis);
      // A code equal to a live one of any tenant is refused by the global route's key;
      // drawing again is the whole remedy.
      for (let draw = 1; ; draw++) {
        const code = newPairingCode();
        try {
          const created = await withTenant(pool, auth.tenantId, async (client) => {
            const branch = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
            if (branch.rowCount === 0) return false;
            await client.query(
              "INSERT INTO device_pairing_code (id, tenant_id, branch_id, code_hash, " +
                "created_by_app_user_id, expires_at, created_at, updated_at, created_by) " +
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $5)",
              [newId(), auth.tenantId, branchId, hashToken(code), auth.appUserId, expiresAt, now],
            );
            return true;
          });
          if (!created) return reply.code(404).send({ code: DEVICE_ERROR_CODES.branchNotFound });
          return reply.code(201).send({ code, branchId, expiresAt: expiresAt.toISOString() });
        } catch (error) {
          const collided = (error as { code?: unknown }).code === UNIQUE_VIOLATION;
          if (!collided || draw >= CODE_DRAWS) throw error;
        }
      }
    },
  );

  // No session: the till has nothing yet but the code. Wrong, expired and used codes get
  // one answer, so probing tells nothing about which codes exist.
  app.post<{ Body: { code: string; deviceName: string } }>(
    "/devices/pair",
    { schema: { body: pairBody } },
    async (request, reply) => {
      const invalid = () => reply.code(401).send({ code: DEVICE_ERROR_CODES.pairingCodeInvalid });
      const code = normalizePairingCode(request.body.code);
      if (code === null) return invalid();
      const codeHash = hashToken(code);
      const routed = await pool.query<{ tenant_id: string | null }>(
        "SELECT fnb_auth.pairing_code_tenant($1) AS tenant_id",
        [codeHash],
      );
      const tenantId = routed.rows[0]?.tenant_id;
      if (tenantId === null || tenantId === undefined) return invalid();
      const now = clock.now();
      const deviceToken = newDeviceToken(tenantId);
      const paired = await withTenant(pool, tenantId, async (client) => {
        // Claiming the code and creating the device commit together. Two tills racing
        // with one code cannot both win: the second UPDATE waits on the first's row lock,
        // then re-checks used_at and matches nothing.
        const claimed = await client.query<{ branch_id: string; created_by_app_user_id: string }>(
          "UPDATE device_pairing_code SET used_at = $2, updated_at = $2, version = version + 1 " +
            "WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2 " +
            "RETURNING branch_id, created_by_app_user_id",
          [codeHash, now],
        );
        const row = claimed.rows[0];
        if (row === undefined) return null;
        const deviceId = newId();
        await client.query(
          "INSERT INTO device (id, tenant_id, branch_id, name, created_at, updated_at, created_by) " +
            "VALUES ($1, $2, $3, $4, $5, $5, $6)",
          [
            deviceId,
            tenantId,
            row.branch_id,
            request.body.deviceName.trim(),
            now,
            row.created_by_app_user_id,
          ],
        );
        await client.query(
          "INSERT INTO device_credential (id, tenant_id, device_id, token_hash, created_at, " +
            "updated_at, created_by) VALUES ($1, $2, $3, $4, $5, $5, $6)",
          [newId(), tenantId, deviceId, hashToken(deviceToken), now, row.created_by_app_user_id],
        );
        return { deviceId, branchId: row.branch_id };
      });
      if (paired === null) return invalid();
      return reply.code(201).send({ ...paired, deviceToken });
    },
  );
}
