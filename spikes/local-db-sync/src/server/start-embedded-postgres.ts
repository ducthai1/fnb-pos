import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

// `date` columns would otherwise become JS Dates at local midnight and shift a business
// day when the process time zone is not the branch's; keep them as "YYYY-MM-DD" text.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export interface RunningPostgres {
  connectionString: string;
  dataDir: string;
  stop(): Promise<void>;
}

export async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A fresh, empty data directory owned by this process; removed by `removePostgresDir`. */
export function makePostgresDir(label: string, baseDir: string = tmpdir()): string {
  return mkdtempSync(join(baseDir, `spike-pg-${process.pid}-${label}-`));
}

export function removePostgresDir(dataDir: string): void {
  rmSync(dataDir, { recursive: true, force: true });
}

export interface StartOptions {
  /** Off only for unit tests: durability of the server is not what they check. */
  fsync?: boolean;
}

/**
 * Starts Postgres on a free port over `dataDir`, initialising it on first use, so a later
 * call on the same directory restarts the same database (the second-run scenario).
 * No unix socket: nothing is written outside the data directory.
 */
export async function startEmbeddedPostgres(
  dataDir: string,
  options: StartOptions = {},
): Promise<RunningPostgres> {
  const port = await findFreePort();
  const errors: string[] = [];
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "spike",
    password: "spike",
    persistent: true,
    postgresFlags: [
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      "unix_socket_directories=",
      "-c",
      `fsync=${options.fsync === false ? "off" : "on"}`,
    ],
    onLog: () => undefined,
    onError: (error) => errors.push(String(error)),
  });
  if (!existsSync(join(dataDir, "PG_VERSION"))) await instance.initialise();
  try {
    await instance.start();
  } catch {
    throw new Error(`embedded postgres failed to start: ${errors.join(" | ").slice(0, 500)}`);
  }
  return {
    connectionString: `postgres://spike:spike@127.0.0.1:${port}/postgres`,
    dataDir,
    stop: () => instance.stop(),
  };
}
