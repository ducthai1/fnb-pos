import { buildApp } from "@fnb/api/build-app";
import { syncShop } from "@fnb/api/test-support/sync-shop";
import { startTestPostgres, testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { addBootstrapStandIn } from "./bootstrap-stand-in";
import { servePosBuild } from "./serve-pos-build";

/** Where the specs find the running stack, and the shop's backoffice owner. */
export interface PosStack {
  posOrigin: string;
  apiOrigin: string;
  /** Signed in to the backoffice as the shop's owner. */
  managerCookie: string;
  branchId: string;
  /** The cashier role, for staff the specs hire. */
  roleId: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    posStack: PosStack;
  }
}

/**
 * The real API (as the app role, bound by row level security) on an embedded Postgres,
 * listening on a free port, and the POS build in front of it. Whatever started is stopped
 * again if a later step fails, so a broken run leaves no Postgres behind.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const stops: (() => Promise<void>)[] = [];
  const stopAll = async () => {
    for (const stop of stops.reverse()) await stop().catch(console.error);
  };
  try {
    const postgres = await startTestPostgres();
    stops.push(() => postgres.stop());
    const pool = new pg.Pool({ connectionString: testConnectionString(postgres.info, "app") });
    stops.push(() => pool.end());
    const app = buildApp({ pool });
    stops.push(() => app.close());
    addBootstrapStandIn(app, pool);
    const apiOrigin = await app.listen({ host: "127.0.0.1", port: 0 });
    const { shop } = await syncShop(app, pool);
    const pos = await servePosBuild(apiOrigin);
    stops.push(pos.close);
    project.provide("posStack", {
      posOrigin: pos.origin,
      apiOrigin,
      managerCookie: shop.managerCookie,
      branchId: shop.branchId,
      roleId: shop.roleId,
    });
    return stopAll;
  } catch (error) {
    await stopAll();
    throw error;
  }
}
