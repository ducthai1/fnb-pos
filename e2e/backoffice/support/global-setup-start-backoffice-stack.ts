import { buildApp } from "@fnb/api/build-app";
import { provisionOrganization } from "@fnb/db";
import { startTestPostgres, testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import type { TestProject } from "vitest/node";
import {
  PASSWORD,
  addMember,
  createAccount,
  uniqueEmail,
} from "../../../apps/api/test/integration/support/backoffice-accounts";
import { staffedShop } from "../../../apps/api/test/integration/support/staffed-shop";
import { serveBackofficeBuild } from "./serve-backoffice-build";

/** Where the specs find the running stack, and who signs in to the backoffice. */
export interface BackofficeStack {
  backofficeOrigin: string;
  apiOrigin: string;
  /** An owner of the shop who is also in a second organization, so signing in asks which. */
  email: string;
  password: string;
  organizationName: string;
  /** Signed in to the API as the shop's first owner, for calls a spec makes itself. */
  managerCookie: string;
  tenantId: string;
  branchId: string;
  /** A till paired to branchId: what it pulls is what a till of the branch would sell. */
  deviceToken: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    backofficeStack: BackofficeStack;
  }
}

const SHOP_NAME = "Công ty Phở Sáng";

/**
 * The real API (as the app role, under row level security) on an embedded Postgres, and the
 * backoffice's production build in front of it, both on free ports. Whatever started is
 * stopped again if a later step fails, so a broken run leaves nothing running.
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
    // A client closing as Postgres stops reports an idle-client error; unheard, it would
    // turn a green run into exit 1.
    pool.on("error", () => {});
    stops.push(() => pool.end());
    const app = buildApp({ pool });
    stops.push(() => app.close());
    const apiOrigin = await app.listen({ host: "127.0.0.1", port: 0 });

    const shop = await staffedShop(app, pool);
    const email = uniqueEmail("e2e-owner");
    const accountId = await createAccount(pool, { email });
    await addMember(pool, shop.tenantId, accountId);
    await provisionOrganization(pool, {
      name: "Công ty Trà Chiều",
      creator: { accountId, displayName: "Chủ quán" },
      now: new Date(),
    });

    const backoffice = await serveBackofficeBuild(apiOrigin);
    stops.push(backoffice.close);
    project.provide("backofficeStack", {
      backofficeOrigin: backoffice.origin,
      apiOrigin,
      email,
      password: PASSWORD,
      organizationName: SHOP_NAME,
      managerCookie: shop.managerCookie,
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      deviceToken: shop.deviceToken,
    });
    return stopAll;
  } catch (error) {
    await stopAll();
    throw error;
  }
}
