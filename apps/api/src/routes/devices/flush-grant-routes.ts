import {
  SERVER_GENERATION_HEADER,
  SERVER_TIME_HEADER,
  SYNC_FEATURES_HEADER,
} from "@fnb/contracts";
import { appendAudit, newId, readServerGeneration, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import type { DeviceAuth } from "../../devices/device-auth-hook";
import { DEVICE_ERROR_CODES } from "../../devices/device-error-codes";
import { readDeviceToken } from "../../devices/device-token";
import {
  claimFlushGrant,
  finishFlushGrant,
  flushCallerOf,
  flushedCommandAuthor,
} from "../../devices/flush-grant";
import { newPairingCode, normalizePairingCode } from "../../devices/pairing-code";
import { uuidJsonSchema } from "../../http/uuid-schema";
import { hashToken } from "../../security/opaque-token";
import { applySyncBatch } from "../../sync/apply-sync-batch";
import { readBranchPricing } from "../../sync/sellable-catalog";
import { SYNC_ERROR_CODES } from "../../sync/sync-error-codes";
import { envelopesOf, flushBatchSchema, resultsForFeatures } from "../../sync/sync-request-schemas";
import type { SyncCommandEnvelope, SyncCommandResult } from "../../sync/sync-wire-types";

const deviceParams = {
  type: "object",
  required: ["id"],
  properties: { id: uuidJsonSchema },
} as const;

const UNIQUE_VIOLATION = "23505";
const CODE_DRAWS = 3;

/** Consecutive commands made under one staff session, as the till stamped them. */
function sessionRuns(commands: readonly SyncCommandEnvelope[]): SyncCommandEnvelope[][] {
  const runs: SyncCommandEnvelope[][] = [];
  for (const command of commands) {
    const last = runs.at(-1);
    if (last !== undefined && last[0]?.staffSessionId === command.staffSessionId) last.push(command);
    else runs.push([command]);
  }
  return runs;
}

/**
 * A revoked till's last word. A manager with manage_devices issues a grant for one revoked
 * device: a code like a pairing code, ten minutes, bound to that device and audited with who
 * issued it. The till sends its outbox with the code and its own (revoked) credential, and the
 * commands go through the very checks of the usual push, one transaction each, under the
 * staff member who made them. A refusal is answered and stored like any other, so the till
 * shows it; a batch cut off by the network is sent again under the same code and its commands
 * answer what they answered the first time. The till's last batch spends the grant. The device
 * stays revoked throughout: without a grant it can send nothing, and the grant opens no other
 * route.
 */
export function registerFlushGrantRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;

  app.post<{ Params: { id: string } }>(
    "/devices/:id/flush-grants",
    {
      onRequest: [context.requireSession, context.requirePermission("manage_devices")],
      schema: { params: deviceParams },
    },
    async (request, reply) => {
      const auth = backofficeAuth(request);
      const deviceId = request.params.id;
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + context.policy.pairingCodeTtlMillis);
      for (let draw = 1; ; draw++) {
        const code = newPairingCode();
        try {
          const outcome = await withTenant(pool, auth.tenantId, async (client) => {
            const { rows } = await client.query<{ revoked: boolean }>(
              "SELECT EXISTS (SELECT 1 FROM device_credential c WHERE c.device_id = d.id) AND " +
                "NOT EXISTS (SELECT 1 FROM device_credential c WHERE c.device_id = d.id AND " +
                "c.revoked_at IS NULL) AS revoked FROM device d WHERE d.id = $1",
              [deviceId],
            );
            const device = rows[0];
            if (device === undefined) return "missing" as const;
            if (!device.revoked) return "live" as const;
            const grantId = newId();
            await client.query(
              "INSERT INTO device_flush_grant (id, tenant_id, device_id, code_hash, " +
                "created_by_app_user_id, expires_at, created_at, updated_at, created_by) " +
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $5)",
              [grantId, auth.tenantId, deviceId, hashToken(code), auth.appUserId, expiresAt, now],
            );
            await appendAudit(client, {
              actor: { kind: "app_user", id: auth.appUserId },
              action: "device.flush_grant_issued",
              entityKind: "device",
              entityId: deviceId,
              payload: { grantId, expiresAt: expiresAt.toISOString() },
            });
            return "issued" as const;
          });
          if (outcome === "missing") {
            return reply.code(404).send({ code: DEVICE_ERROR_CODES.deviceNotFound });
          }
          if (outcome === "live") {
            return reply.code(409).send({ code: DEVICE_ERROR_CODES.deviceNotRevoked });
          }
          return reply.code(201).send({ code, deviceId, expiresAt: expiresAt.toISOString() });
        } catch (error) {
          const collided = (error as { code?: unknown }).code === UNIQUE_VIOLATION;
          if (!collided || draw >= CODE_DRAWS) throw error;
        }
      }
    },
  );

  app.post(
    "/sync/revoked-flush",
    { onRequest: context.requireCurrentBuild },
    async (request, reply) => {
      const parsed = flushBatchSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const invalidGrant = () =>
        reply.code(401).send({ code: DEVICE_ERROR_CODES.flushGrantInvalid });
      const authorization = request.headers.authorization;
      const tenantId = readDeviceToken(authorization)?.tenantId;
      const code = normalizePairingCode(parsed.data.code);
      const now = clock.now();
      const opened =
        tenantId === undefined
          ? null
          : await withTenant(pool, tenantId, async (client) => {
              const caller = await flushCallerOf(client, authorization);
              if (caller.kind !== "revoked") return caller.kind;
              if (code === null) return "invalid" as const;
              const grant = await claimFlushGrant(client, caller.device.deviceId, hashToken(code), now);
              if (grant === null) return "invalid" as const;
              return {
                grant,
                device: caller.device,
                branch: await readBranchPricing(client, caller.device.branchId),
                generation: await readServerGeneration(client),
              };
            });
      if (opened === null || opened === "unknown") {
        return reply.code(401).send({ code: DEVICE_ERROR_CODES.unauthenticated });
      }
      if (opened === "live") {
        return reply.code(409).send({ code: DEVICE_ERROR_CODES.deviceNotRevoked });
      }
      if (opened === "invalid") return invalidGrant();
      const { grant, device, branch, generation } = opened;
      const commands = envelopesOf(parsed.data);
      const answered: SyncCommandResult[] = [];
      for (const run of sessionRuns(commands)) {
        const staffId = await withTenant(pool, device.tenantId, (client) =>
          flushedCommandAuthor(client, device.deviceId, run[0]?.staffSessionId),
        );
        if (staffId === null) {
          return reply.code(409).send({ code: DEVICE_ERROR_CODES.flushNoAuthor });
        }
        const results = await applySyncBatch(
          pool,
          { device, staffId, branch, receivedAt: now },
          run,
        );
        answered.push(...results);
        if (results.some((result) => result.status === "retry")) {
          const later = commands.slice(answered.length);
          answered.push(
            ...later.map((command) => ({
              commandId: command.commandId,
              status: "retry" as const,
              code: SYNC_ERROR_CODES.outOfOrder,
            })),
          );
          break;
        }
      }
      // The last batch spends the grant only when every command in it was settled: one told
      // to retry (its clock, its order) still has to come, under the same code.
      const settled = answered.every((result) => result.status !== "retry");
      await withTenant(pool, device.tenantId, async (client) => {
        if (parsed.data.final === true && settled) await finishFlushGrant(client, grant.id, now);
        await auditFlushedBatch(client, device, grant, answered, parsed.data.final === true && settled);
      });
      const features = String(request.headers[SYNC_FEATURES_HEADER] ?? "");
      return reply
        .header(SERVER_GENERATION_HEADER, generation)
        .header(SERVER_TIME_HEADER, String(clock.now().getTime()))
        .send({ results: resultsForFeatures(answered, features) });
    },
  );
}

/** One audit row per batch: under whose grant, and which commands it took and refused. */
async function auditFlushedBatch(
  client: Parameters<typeof appendAudit>[0],
  device: DeviceAuth,
  grant: { id: string; createdByAppUserId: string },
  answered: readonly SyncCommandResult[],
  finished: boolean,
) {
  const ids = (status: SyncCommandResult["status"]) =>
    answered.filter((result) => result.status === status).map((result) => result.commandId);
  await appendAudit(client, {
    actor: { kind: "device", id: device.deviceId },
    action: "device.flushed_under_grant",
    entityKind: "device",
    entityId: device.deviceId,
    payload: {
      grantId: grant.id,
      issuedByAppUserId: grant.createdByAppUserId,
      accepted: ids("accepted"),
      rejected: ids("rejected"),
      finished,
    },
  });
}
