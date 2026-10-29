import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import pg from "pg";
import { type AppDependencies, buildApp } from "../build-app";
import { FakeEInvoiceProvider } from "../einvoice/providers/fake-einvoice-provider";
import { systemClock } from "../clock";
import { clientErrorLines } from "../client-errors/client-error-log";
import { installRateLimits } from "../http/rate-limit-hooks";
import { maskSecrets, serverErrorLines } from "../http/server-error-report";
import { installCleanupJob } from "../ops/sign-in-cleanup-job";
import { walletGateways } from "../payments/wallets/wallet-gateways";
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
    await prepareMediaDirectory(config.mediaDirectory);
    const app = buildApp({
      ...dependenciesOf(config, pool, log),
      // Every 500, with its route and masked message, so a fault in production leaves a trace.
      onServerError: (report) => serverErrorLines(report).forEach(logError),
      // Faults the POS and the backoffice report, in the same journal as the server's own.
      onClientError: (entry) => clientErrorLines(entry).forEach(logError),
    });
    installRateLimits(app, config.rateLimits, systemClock);
    if (config.cleanup !== null) {
      installCleanupJob(app, {
        pool,
        clock: systemClock,
        settings: config.cleanup,
        onRound: (report) => {
          const removed = report.pairingCodes + report.staffSessions + report.backofficeSessions;
          if (removed === 0) return;
          log(
            `cleanup removed ${report.pairingCodes} pairing codes, ${report.staffSessions} ` +
              `staff sessions, ${report.backofficeSessions} backoffice sessions`,
          );
        },
        onError: (error) => logError(`cleanup round failed: ${maskSecrets(String(error))}`),
      });
    }
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
  const dependencies: AppDependencies = {
    pool,
    secureCookies: config.secureCookies,
    mediaDirectory: config.mediaDirectory,
  };
  if (config.paymentSecretKey !== null) dependencies.paymentSecretKey = config.paymentSecretKey;
  if (config.allowedOrigins !== null) dependencies.allowedOrigins = config.allowedOrigins;
  dependencies.wallets = walletGateways(config.zaloPayEnvironment);
  if (config.walletCallbackBase !== null) {
    dependencies.walletCallbackBase = config.walletCallbackBase;
  }
  dependencies.walletPoller = {
    intervalMs: config.walletPollIntervalMs,
    onError: (error) => log(`wallet poll round failed: ${maskSecrets(String(error))}`),
  };
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

/** Photos are written while the shop works; a directory the API cannot write stops it now. */
async function prepareMediaDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory, { recursive: true, mode: 0o750 });
    await access(directory, constants.W_OK);
  } catch {
    throw new Error("FNB_MEDIA_DIR cannot be created or written by the API's user");
  }
}
