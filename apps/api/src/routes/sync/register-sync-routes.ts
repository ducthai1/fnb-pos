import {
  SERVER_GENERATION_HEADER,
  SERVER_TIME_HEADER,
  SYNC_FEATURES_HEADER,
  SYNC_FEATURE_SHIFT_VERSION,
} from "@fnb/contracts";
import { readServerGeneration, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { deviceAuth } from "../../devices/device-auth-hook";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import { applySyncBatch } from "../../sync/apply-sync-batch";
import { readChangesPage } from "../../sync/change-feed";
import { lastDeviceSeqOf } from "../../sync/command-ledger";
import { readBranchPricing } from "../../sync/sellable-catalog";
import {
  envelopesOf,
  syncChangesQuerySchema,
  syncCommandBatchSchema,
} from "../../sync/sync-request-schemas";

/**
 * The sync endpoints of a till. Pushing commands needs a staff member signed in on the
 * till, who is recorded as their author; pulling changes needs only the till's credential,
 * and shows the till its own branch's changes, never another branch's or tenant's. Every
 * answer names the server's generation, read in the same transaction as what it answers,
 * so a till learns of a restore from the first answer of the restored server. Every answer
 * also carries the server's clock, read as it is sent, for the till to date its commands by.
 */
export function registerSyncRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;
  const tillOfCurrentBuild = [context.requireDevice, context.requireCurrentBuild];

  app.post("/sync/commands", { onRequest: tillOfCurrentBuild }, async (request, reply) => {
    const device = deviceAuth(request);
    const parsed = syncCommandBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const now = clock.now();
    const sender = await withTenant(pool, device.tenantId, async (client) => {
      const staff = await findCurrentStaffSession(
        client,
        device,
        request.headers[STAFF_SESSION_HEADER],
        now,
      );
      if (staff === undefined) return null;
      return {
        device,
        staffId: staff.staffId,
        branch: await readBranchPricing(client, device.branchId),
        receivedAt: now,
        generation: await readServerGeneration(client),
      };
    });
    if (sender === null) return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
    const { generation, ...syncSender } = sender;
    const answered = await applySyncBatch(pool, syncSender, envelopesOf(parsed.data));
    // A till of an older release parses each answer strictly: it only gets the fields it asked for.
    const features = String(request.headers[SYNC_FEATURES_HEADER] ?? "").split(",");
    const results = features.map((name) => name.trim()).includes(SYNC_FEATURE_SHIFT_VERSION)
      ? answered
      : answered.map((result) => {
          const { shiftVersion, ...plain } = result;
          return shiftVersion === undefined ? result : plain;
        });
    return reply
      .header(SERVER_GENERATION_HEADER, generation)
      .header(SERVER_TIME_HEADER, String(clock.now().getTime()))
      .send({ results });
  });

  app.get("/sync/changes", { onRequest: tillOfCurrentBuild }, async (request, reply) => {
    const device = deviceAuth(request);
    const parsed = syncChangesQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const { cursor, limit } = parsed.data;
    const { page, generation } = await withTenant(pool, device.tenantId, async (client) => ({
      generation: await readServerGeneration(client),
      page: await readChangesPage(client, device.branchId, cursor, limit),
    }));
    return reply
      .header(SERVER_GENERATION_HEADER, generation)
      .header(SERVER_TIME_HEADER, String(clock.now().getTime()))
      .send(page);
  });

  // What the server holds of this till, asked by a till that met a new generation: it sends
  // again every command it numbered after lastDeviceSeq. Needs only the till's credential,
  // since the staff sessions a till held may be the very rows a restore took away.
  app.get("/sync/device-state", { onRequest: tillOfCurrentBuild }, async (request, reply) => {
    const device = deviceAuth(request);
    const state = await withTenant(pool, device.tenantId, async (client) => ({
      serverGeneration: await readServerGeneration(client),
      lastDeviceSeq: await lastDeviceSeqOf(client, device.deviceId),
    }));
    return reply
      .header(SERVER_GENERATION_HEADER, state.serverGeneration)
      .header(SERVER_TIME_HEADER, String(clock.now().getTime()))
      .send(state);
  });
}
