import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { deviceAuth } from "../../devices/device-auth-hook";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import { applySyncBatch } from "../../sync/apply-sync-batch";
import { readChangesPage } from "../../sync/change-feed";
import { readBranchPricing } from "../../sync/sellable-catalog";
import {
  envelopesOf,
  syncChangesQuerySchema,
  syncCommandBatchSchema,
} from "../../sync/sync-request-schemas";

/**
 * The two sync endpoints of a till. Pushing commands needs a staff member signed in on the
 * till, who is recorded as their author; pulling changes needs only the till's credential,
 * and shows the till its own branch's changes, never another branch's or tenant's.
 */
export function registerSyncRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock } = context;

  app.post("/sync/commands", { onRequest: context.requireDevice }, async (request, reply) => {
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
      };
    });
    if (sender === null) return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
    const results = await applySyncBatch(pool, sender, envelopesOf(parsed.data));
    return reply.send({ results });
  });

  app.get("/sync/changes", { onRequest: context.requireDevice }, async (request, reply) => {
    const device = deviceAuth(request);
    const parsed = syncChangesQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const { cursor, limit } = parsed.data;
    const page = await withTenant(pool, device.tenantId, (client) =>
      readChangesPage(client, device.branchId, cursor, limit),
    );
    return reply.send(page);
  });
}
