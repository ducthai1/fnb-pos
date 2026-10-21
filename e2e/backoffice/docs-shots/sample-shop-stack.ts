import { buildApp } from "@fnb/api/build-app";
import { FakeEInvoiceProvider } from "@fnb/api/fake-einvoice-provider";
import { startTestPostgres, testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { generateDevStackLogins } from "../../../scripts/src/dev-stack/dev-stack-generated-logins";
import { seedOwnerAndOrganization } from "../../../scripts/src/dev-stack/seed/seed-owner-and-organization";
import {
  type SampleShop,
  seedSampleShop,
} from "../../../scripts/src/dev-stack/seed/seed-sample-shop";
import { scratchMediaDirectory } from "../../support/scratch-media-directory";
import { serveBackofficeBuild } from "../support/serve-backoffice-build";

/** The sample café of `pnpm dev:stack`, served on free ports for the handbook's pictures. */
export interface SampleShopStack {
  readonly apiOrigin: string;
  readonly backofficeOrigin: string;
  readonly shop: SampleShop;
  readonly owner: { readonly email: string; readonly password: string };
  /** The owner signed in to the API, for the calls the pictures need made first. */
  readonly ownerCookie: string;
  stop(): Promise<void>;
}

/**
 * A throwaway Postgres, the real API on it (app role, row level security) with the sample
 * café seeded through its routes and its photos, and the backoffice's production build in
 * front. Nothing touches `pnpm dev:stack`'s data or ports. Everything started is stopped
 * again if a later step fails.
 */
export async function startSampleShopStack(): Promise<SampleShopStack> {
  const stops: (() => Promise<void>)[] = [];
  const stop = async () => {
    for (const step of stops.reverse()) await step().catch(console.error);
  };
  try {
    const postgres = await startTestPostgres();
    stops.push(() => postgres.stop());
    const pool = new pg.Pool({ connectionString: testConnectionString(postgres.info, "app") });
    pool.on("error", () => undefined);
    stops.push(() => pool.end());
    const media = scratchMediaDirectory();
    stops.push(media.remove);
    const logins = generateDevStackLogins();
    const app = buildApp({
      pool,
      paymentSecretKey: Buffer.from(logins.paymentSecretKey, "base64"),
      einvoiceProviders: [new FakeEInvoiceProvider()],
      mediaDirectory: media.path,
    });
    stops.push(() => app.close());
    const shop = await seedSampleShop(app, pool, logins);
    const { cookie } = await seedOwnerAndOrganization(app, pool, logins.owner);
    const apiOrigin = await app.listen({ host: "127.0.0.1", port: 0 });
    const backoffice = await serveBackofficeBuild(apiOrigin);
    stops.push(backoffice.close);
    return {
      apiOrigin,
      backofficeOrigin: backoffice.origin,
      shop,
      owner: { email: logins.owner.email, password: logins.owner.password },
      ownerCookie: cookie,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
