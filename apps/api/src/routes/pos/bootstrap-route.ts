import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import { lockTenantChangeFeed } from "../../sync/change-feed";
import { readPosBootstrap } from "./bootstrap-snapshot";

/**
 * GET /pos/bootstrap: what a till loads on first start or after losing its data. Only the
 * till's credential is needed, not a staff session, because the PIN screen that opens one
 * lists the staff from this answer. It shows the till its own tenant, brand and branch.
 */
export function registerPosBootstrapRoute(app: FastifyInstance, context: ApiContext): void {
  app.get("/pos/bootstrap", { onRequest: context.requireDevice }, async (request, reply) => {
    const device = deviceAuth(request);
    // A barrier, in a transaction of its own: wait until every feed write in flight has
    // committed. A write that began before this till was paired fanned out to the tills it
    // knew of; once it has committed, the reads below see its result, so missing from its
    // fan-out costs this till nothing. Holding the lock for the whole read instead would
    // stop every till of the tenant for as long as a menu takes to read.
    await withTenant(context.pool, device.tenantId, (client) =>
      lockTenantChangeFeed(client, device.tenantId),
    );
    const now = context.clock.now();
    const body = await withTenant(context.pool, device.tenantId, (client) =>
      readPosBootstrap(client, device, now),
    );
    return reply.send(body);
  });
}
