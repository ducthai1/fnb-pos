import { existsSync } from "node:fs";
import { join } from "node:path";
import { type LoadOptions, loadEmbeddedPostgres } from "./load-embedded-postgres";

export interface EmbeddedPostgresOptions extends LoadOptions {
  readonly dataDirectory: string;
  readonly port: number;
  /** The bootstrap superuser, set when the cluster is first created. */
  readonly superuser: { readonly user: string; readonly password: string };
  /**
   * false trades durability for speed (no fsync), for data thrown away after a test run.
   * Data someone keeps between runs stays durable.
   */
  readonly durable: boolean;
  readonly log?: (line: string) => void;
}

export interface RunningEmbeddedPostgres {
  /** Whether this start created the cluster, or found one in the data directory. */
  readonly createdCluster: boolean;
  /** Stops the server; the data directory is left as it is. */
  stop(): Promise<void>;
}

/**
 * Postgres 17 from the embedded binaries (no Docker, no root), listening on 127.0.0.1 only
 * and without a unix socket, so sessions running their own servers on this machine never
 * meet in a shared socket directory. A data directory holding a cluster is started as it
 * is; an empty one is initialised first.
 */
export async function startEmbeddedPostgres(
  options: EmbeddedPostgresOptions,
): Promise<RunningEmbeddedPostgres> {
  const EmbeddedPostgres = await loadEmbeddedPostgres(options);
  const log = options.log ?? (() => undefined);
  const flags = [
    ["listen_addresses", "127.0.0.1"],
    ["unix_socket_directories", ""],
    ...(options.durable
      ? []
      : [
          ["fsync", "off"],
          ["synchronous_commit", "off"],
          ["full_page_writes", "off"],
        ]),
  ];
  const server = new EmbeddedPostgres({
    databaseDir: options.dataDirectory,
    port: options.port,
    user: options.superuser.user,
    password: options.superuser.password,
    authMethod: "scram-sha-256",
    // The data directory is the caller's: it decides when to delete it.
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
    postgresFlags: flags.flatMap(([name, value]) => ["-c", `${name}=${value}`]),
    onLog: (message) => log(String(message)),
    onError: (message) => log(String(message)),
  });
  const createdCluster = !existsSync(join(options.dataDirectory, "PG_VERSION"));
  if (createdCluster) await server.initialise();
  try {
    await server.start();
  } catch (error) {
    await server.stop().catch(() => undefined);
    throw error;
  }
  return { createdCluster, stop: () => server.stop() };
}
