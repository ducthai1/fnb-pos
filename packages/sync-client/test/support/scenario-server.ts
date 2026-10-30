import { buildApp } from "@fnb/api/build-app";
import { PAYMENT_GATEWAYS } from "@fnb/api/payment-gateways";
import { fakePaymentGateway } from "@fnb/api/test-support/fake-payment-gateway";
import { TEST_PAYMENT_SECRET_KEY } from "@fnb/api/test-support/payment-webhooks";
import { type SyncShop, type SyncShopOptions, syncShop } from "@fnb/api/test-support/sync-shop";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { inject } from "vitest";
import type { HttpSend } from "../../src";
import { injectHttpSend } from "./inject-http-send";

/** What a scenario may choose about the server it runs against. */
export interface ScenarioServerOptions {
  /**
   * The API's only source of "now". A scenario that passes one moves the server's time by
   * hand, together with its tills'; without one the server reads the real clock.
   */
  clock?: { now(): Date };
  /** Takes bank notices from the fake gateway, so a scenario can have a customer pay a QR. */
  fakeGateway?: boolean;
}

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

  private constructor(
    private readonly connectionString: string,
    private readonly serverOptions: ScenarioServerOptions,
  ) {
    this.pool = this.connect();
    this.app = this.build();
  }

  private build(): ReturnType<typeof buildApp> {
    return buildApp({
      pool: this.pool,
      ...(this.serverOptions.clock === undefined ? {} : { clock: this.serverOptions.clock }),
      ...(this.serverOptions.fakeGateway === true
        ? {
            paymentSecretKey: TEST_PAYMENT_SECRET_KEY,
            paymentGateways: [...PAYMENT_GATEWAYS, fakePaymentGateway()],
          }
        : {}),
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
    serverOptions: ScenarioServerOptions = {},
  ): Promise<{ server: ScenarioServer; shop: SyncShop }> {
    const server = new ScenarioServer(connectionString, serverOptions);
    return { server, shop: await syncShop(server.app, server.pool, options) };
  }

  private connect(): pg.Pool {
    // max above the number of requests two tills and their duplicates have in flight.
    return new pg.Pool({ connectionString: this.connectionString, max: 20 });
  }

  /** The API as it runs now, for a scenario that sets the shop up through its routes. */
  get api(): ReturnType<typeof buildApp> {
    return this.app;
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
