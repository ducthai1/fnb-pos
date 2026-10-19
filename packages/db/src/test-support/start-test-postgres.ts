import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findFreePort } from "./find-free-port";
import { loadEmbeddedPostgres } from "./load-embedded-postgres";
import { provisionTestDatabase } from "./provision-test-database";
import type { TestPostgresInfo } from "./test-postgres-info";

export interface RunningTestPostgres {
  info: TestPostgresInfo;
  /** Stops the server and deletes its data directory. */
  stop(): Promise<void>;
}

const START_ATTEMPTS = 3;

// Tests only: durability is irrelevant, speed is not. No unix socket, so parallel sessions
// on this machine can never meet in a shared socket directory.
const SERVER_FLAGS = [
  ["listen_addresses", "127.0.0.1"],
  ["unix_socket_directories", ""],
  ["fsync", "off"],
  ["synchronous_commit", "off"],
  ["full_page_writes", "off"],
].flatMap(([name, value]) => ["-c", `${name}=${value}`]);

/**
 * Starts a throwaway Postgres (embedded binaries, no Docker, no root) on a free port with
 * its data in a fresh temp directory, then provisions and migrates the test database.
 */
export async function startTestPostgres(): Promise<RunningTestPostgres> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt++) {
    try {
      return await startOnce();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`embedded Postgres did not start after ${START_ATTEMPTS} attempts`, {
    cause: lastError,
  });
}

async function startOnce(): Promise<RunningTestPostgres> {
  const port = await findFreePort();
  const dataDirectory = join(tmpdir(), `fnb-pg-${process.pid}-${secret().slice(0, 8)}`);
  const serverLog: string[] = [];
  const info: TestPostgresInfo = {
    host: "127.0.0.1",
    port,
    database: "fnb_test",
    superuser: { user: "postgres", password: secret() },
    owner: { user: "fnb_owner", password: secret() },
    app: { user: "fnb_app", password: secret() },
  };
  const EmbeddedPostgres = await loadEmbeddedPostgres();
  const server = new EmbeddedPostgres({
    databaseDir: dataDirectory,
    port,
    user: info.superuser.user,
    password: info.superuser.password,
    authMethod: "scram-sha-256",
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
    postgresFlags: SERVER_FLAGS,
    onLog: (message) => serverLog.push(String(message)),
    onError: (message) => serverLog.push(String(message)),
  });
  const stop = async (): Promise<void> => {
    await server.stop().catch(() => undefined);
    await rm(dataDirectory, { recursive: true, force: true });
  };
  try {
    await server.initialise();
    await server.start();
    await provisionTestDatabase(info);
  } catch (error) {
    await stop();
    throw new Error(
      `embedded Postgres failed on port ${port}:\n${serverLog.slice(-20).join("\n")}`,
      {
        cause: error,
      },
    );
  }
  return { info, stop };
}

function secret(): string {
  return randomBytes(16).toString("hex");
}
