import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export type PostgresTool = "pg_dump" | "pg_restore";

/**
 * Where pg_dump or pg_restore is: FNB_PG_BIN_DIR when set (such as
 * /usr/lib/postgresql/17/bin), otherwise the first one on PATH. Null when neither has it.
 */
export function findPostgresTool(
  tool: PostgresTool,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const directories =
    env.FNB_PG_BIN_DIR !== undefined && env.FNB_PG_BIN_DIR !== ""
      ? [env.FNB_PG_BIN_DIR]
      : (env.PATH ?? "").split(delimiter).filter((entry) => entry !== "");
  for (const directory of directories) {
    const candidate = join(directory, tool);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The libpq variables naming the server of `url` and `database`. The password goes in
 * PGPASSWORD of the child's environment, never on its command line, where `ps` would show
 * it to every user of the machine; a URL without one leaves libpq to PGPASSFILE (~/.pgpass).
 */
export function libpqEnvironment(url: string, database?: string): Record<string, string> {
  const parsed = new URL(url);
  const env: Record<string, string> = {
    PGHOST: parsed.searchParams.get("host") ?? decodeURIComponent(parsed.hostname),
    PGUSER: decodeURIComponent(parsed.username),
    PGDATABASE: database ?? decodeURIComponent(parsed.pathname.slice(1)),
  };
  if (parsed.port !== "") env.PGPORT = parsed.port;
  if (parsed.password !== "") env.PGPASSWORD = decodeURIComponent(parsed.password);
  return env;
}

export interface ToolRun {
  readonly exitCode: number | null;
  readonly stderr: string;
}

/** Runs a client tool with the parent's environment plus `env`; its stderr is collected. */
export function runPostgresTool(
  path: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<ToolRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stderr }));
  });
}
