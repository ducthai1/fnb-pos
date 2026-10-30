import { buildApp } from "@fnb/api/build-app";
import { type SyncShop, type SyncShopOptions, syncShop } from "@fnb/api/test-support/sync-shop";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { inject } from "vitest";
import type { HttpSend } from "../../src";
import { injectHttpSend } from "./inject-http-send";

export interface BackofficeRequest {
  readonly method: "GET" | "PUT" | "POST" | "DELETE";
  readonly url: string;
  readonly cookie: string;
  readonly payload?: object;
}

/**
 * The real API on the run's Postgres, as the app role (bound by row level security). It can
 * be restarted on the same database, the way a deploy restarts it under running tills, or
 * stopped while its database is copied or replaced, the way a backup and a restore are.
 */
export class ScenarioServer {
  private app: ReturnType<typeof buildApp>;
  pool: pg.Pool;
  private minimumPosBuild: number | undefined;

  private constructor(private readonly connectionString: string) {
    this.pool = this.connect();
    this.app = this.build();
  }

  private build(): ReturnType<typeof buildApp> {
    return buildApp({
      pool: this.pool,
      ...(this.minimumPosBuild === undefined ? {} : { minimumPosBuild: this.minimumPosBuild }),
    });
  }

  /**
   * A fresh server and a shop with two tills, staff signed in, their shifts open, and a small
   * menu; on the run's shared database unless the app role's connection string of another
   * is given.
   */
  static async withShop(
    connectionString = testConnectionString(inject("testPostgres"), "app"),
    options: SyncShopOptions = {},
  ): Promise<{ server: ScenarioServer; shop: SyncShop }> {
    const server = new ScenarioServer(connectionString);
    return { server, shop: await syncShop(server.app, server.pool, options) };
  }

  private connect(): pg.Pool {
    // max above the number of requests two tills and their duplicates have in flight.
    return new pg.Pool({ connectionString: this.connectionString, max: 20 });
  }

  /** Requests go to whichever server is running when they are sent. */
  readonly send: HttpSend = (request) => injectHttpSend(this.app)(request);

  /** A request as the backoffice sends it, signed in by `cookie`, to the running server. */
  async backoffice(request: BackofficeRequest): Promise<{ status: number; body: string }> {
    const response = await this.app.inject({
      method: request.method,
      url: request.url,
      headers: { cookie: request.cookie },
      ...(request.payload === undefined ? {} : { payload: request.payload }),
    });
    return { status: response.statusCode, body: response.body };
  }

  /** Restarts the server so that it serves no POS build below `build`, as a deploy that sets it does. */
  async requirePosBuild(build: number): Promise<void> {
    this.minimumPosBuild = build;
    await this.restart();
  }

  async restart(): Promise<void> {
    await this.close();
    this.start();
  }

  /** Back up after close(): a new pool and app on the same connection string. */
  start(): void {
    this.pool = this.connect();
    this.app = this.build();
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.pool.end();
  }
}
