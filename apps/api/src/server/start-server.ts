import pg from "pg";
import { type AppDependencies, buildApp } from "../build-app";
import { FakeEInvoiceProvider } from "../einvoice/providers/fake-einvoice-provider";
import { systemClock } from "../clock";
import { installRateLimits } from "../http/rate-limit-hooks";
import { maskSecrets, serverErrorLines } from "../http/server-error-report";
import type { ServerConfig } from "./server-config";

export interface RunningServer {
  /** Where it listens, such as http://127.0.0.1:3000. */
  readonly url: string;
  /** Stops taking requests, lets the invoice worker finish its round, then closes the pool. */
  stop(): Promise<void>;
}

export type ServerLog = (line: string) => void;

/**
 * The API as a process: a pool of the app role, the app built on it, listening. Refuses a
 * database role that row level security does not bind, since every tenant's rows would
 * then be one forgotten filter away from each other.
 */
export async function startServer(
  config: ServerConfig,
  log: ServerLog,
  logError: ServerLog = log,
): Promise<RunningServer> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  // An idle client losing its connection (the database restarted) must not end the process;
  // the next query reconnects and /health answers 503 meanwhile.
  pool.on("error", (error) => logError(`database connection lost: ${maskSecrets(error.message)}`));
  try {
    await refusePrivilegedRole(pool);
    const app = buildApp({
      ...dependenciesOf(config, pool, log),
      // Every 500, with its route and masked message, so a fault in production leaves a trace.
      onServerError: (report) => serverErrorLines(report).forEach(logError),
    });
    installRateLimits(app, config.rateLimits, systemClock);
    const url = await app.listen({ host: config.host, port: config.port });
    return {
      url,
      stop: async () => {
        await app.close();
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

function dependenciesOf(config: ServerConfig, pool: pg.Pool, log: ServerLog): AppDependencies {
  const dependencies: AppDependencies = { pool, secureCookies: config.secureCookies };
  if (config.paymentSecretKey !== null) dependencies.paymentSecretKey = config.paymentSecretKey;
  if (config.allowedOrigins !== null) dependencies.allowedOrigins = config.allowedOrigins;
  if (config.einvoiceProvider === "fake") {
    dependencies.einvoiceProviders = [new FakeEInvoiceProvider()];
    dependencies.einvoiceWorker = {
      intervalMs: config.einvoiceWorkerIntervalMs,
      onError: (error) => log(`invoice worker round failed: ${maskSecrets(String(error))}`),
    };
  }
  return dependencies;
}

async function refusePrivilegedRole(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const role = rows[0];
  if (role === undefined || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      "the database role bypasses row level security; connect as the app role (fnb_app)",
    );
  }
}
