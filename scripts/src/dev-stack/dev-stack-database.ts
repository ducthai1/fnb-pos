import { buildApp } from "@fnb/api/build-app";
import { FakeEInvoiceProvider } from "@fnb/api/fake-einvoice-provider";
import { databaseUrlFor, provisionDatabase } from "@fnb/db";
import { startEmbeddedPostgres } from "@fnb/db/embedded-postgres";
import pg from "pg";
import { DEV_MEDIA_DIRECTORY, DEV_STACK_PATHS } from "./dev-stack-paths";
import type { DevStackLogins } from "./dev-stack-generated-logins";
import { type SampleShop, seedSampleShop } from "./seed/seed-sample-shop";

export const DEV_DATABASE = "fnb_dev";

export interface DevDatabase {
  /** The app role's connection string: what the API is started with. */
  readonly appUrl: string;
  readonly createdCluster: boolean;
  readonly shop: SampleShop;
  stop(): Promise<void>;
}

/**
 * The stack's Postgres with its data kept in tmp/dev-stack, provisioned the way a real
 * environment is (roles, default privileges, migrations), then the sample shop seeded
 * through the API's routes in this process before the API itself starts.
 */
export async function startDevDatabase(port: number, logins: DevStackLogins): Promise<DevDatabase> {
  // The last lines only, shown if the server will not start.
  const serverLog: string[] = [];
  const remember = (line: string) => {
    serverLog.push(line);
    if (serverLog.length > 30) serverLog.shift();
  };
  const postgres = await startEmbeddedPostgres({
    dataDirectory: DEV_STACK_PATHS.postgresData,
    port,
    superuser: { user: "postgres", password: logins.postgres.superuserPassword },
    durable: true,
    signalHandlers: "remove",
    log: remember,
  }).catch((error: unknown) => {
    throw new Error(`Postgres không khởi động được:\n${serverLog.join("\n")}`, { cause: error });
  });
  try {
    const adminUrl = databaseUrlFor(`postgresql://127.0.0.1:${port}/postgres`, {
      credentials: { user: "postgres", password: logins.postgres.superuserPassword },
    });
    const app = { user: "fnb_app", password: logins.postgres.appPassword };
    await provisionDatabase({
      adminUrl,
      database: DEV_DATABASE,
      owner: { user: "fnb_owner", password: logins.postgres.ownerPassword },
      app,
    });
    const appUrl = databaseUrlFor(adminUrl, { database: DEV_DATABASE, credentials: app });
    const shop = await seedThroughTheApi(appUrl, logins);
    return { appUrl, createdCluster: postgres.createdCluster, shop, stop: () => postgres.stop() };
  } catch (error) {
    await postgres.stop().catch(() => undefined);
    throw error;
  }
}

async function seedThroughTheApi(appUrl: string, logins: DevStackLogins): Promise<SampleShop> {
  const pool = new pg.Pool({ connectionString: appUrl });
  pool.on("error", () => undefined);
  const api = buildApp({
    pool,
    paymentSecretKey: Buffer.from(logins.paymentSecretKey, "base64"),
    einvoiceProviders: [new FakeEInvoiceProvider()],
    // The same directory the stack's API serves photos from.
    mediaDirectory: DEV_MEDIA_DIRECTORY,
  });
  try {
    return await seedSampleShop(api, pool, logins);
  } finally {
    await api.close();
    await pool.end();
  }
}
