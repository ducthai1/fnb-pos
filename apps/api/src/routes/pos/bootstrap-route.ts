import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import { readPosBootstrap } from "./bootstrap-snapshot";

/**
 * GET /pos/bootstrap: what a till loads on first start or after losing its data. Only the
 * till's credential is needed, not a staff session, because the PIN screen that opens one
 * lists the staff from this answer. It shows the till its own tenant, brand and branch.
 */
export function registerPosBootstrapRoute(app: FastifyInstance, context: ApiContext): void {
  app.get("/pos/bootstrap", { onRequest: context.requireDevice }, async (request, reply) => {
    const device = deviceAuth(request);
    const now = context.clock.now();
    const body = await withTenant(context.pool, device.tenantId, (client) =>
      readPosBootstrap(client, device, now),
    );
    return reply.send(body);
  });
}
