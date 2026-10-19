import { buildApp } from "@fnb/api/build-app";
import { type SyncShop, syncShop } from "@fnb/api/test-support/sync-shop";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { inject } from "vitest";
import type { HttpSend } from "../../src";
import { injectHttpSend } from "./inject-http-send";

/**
 * The real API on the run's Postgres, as the app role (bound by row level security). It can
 * be restarted on the same database, the way a deploy restarts it under running tills.
 */
export class ScenarioServer {
  private app: ReturnType<typeof buildApp>;
  pool: pg.Pool;

  private constructor() {
    this.pool = ScenarioServer.connect();
    this.app = buildApp({ pool: this.pool });
  }

  /** A fresh server and a shop with two tills, staff signed in, and a small menu. */
  static async withShop(): Promise<{ server: ScenarioServer; shop: SyncShop }> {
    const server = new ScenarioServer();
    return { server, shop: await syncShop(server.app, server.pool) };
  }

  private static connect(): pg.Pool {
    // max above the number of requests two tills and their duplicates have in flight.
    return new pg.Pool({
      connectionString: testConnectionString(inject("testPostgres"), "app"),
      max: 20,
    });
  }

  /** Requests go to whichever server is running when they are sent. */
  readonly send: HttpSend = (request) => injectHttpSend(this.app)(request);

  async restart(): Promise<void> {
    await this.close();
    this.pool = ScenarioServer.connect();
    this.app = buildApp({ pool: this.pool });
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.pool.end();
  }
}
