import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findFreePort } from "@fnb/db/test-support";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKOFFICE_ROOT = join(HERE, "../../../apps/backoffice");
const NEXT_BIN = createRequire(join(BACKOFFICE_ROOT, "package.json")).resolve("next/dist/bin/next");
const OUTPUT_KEPT = 8_000;

/** `next` of the backoffice as a child process, its output kept (the tail) for errors. */
function next(args: string[], apiOrigin: string): { child: ChildProcess; output: () => string } {
  let output = "";
  const child = spawn(process.execPath, [NEXT_BIN, ...args], {
    cwd: BACKOFFICE_ROOT,
    // Rewrites are fixed at build time; the server reads the same value at start.
    env: { ...process.env, FNB_API_ORIGIN: apiOrigin, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const keep = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-OUTPUT_KEPT);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return { child, output: () => output };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await exited;
  clearTimeout(timer);
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2_000) })).status === 200;
  } catch {
    return false;
  }
}

/**
 * The backoffice as it ships: `next build` (into the app's own build directory, never the
 * one a dev server reads), then `next start` on a free port with /api rewritten to
 * `apiOrigin`. The server is this process's child and is stopped by its handle.
 */
export async function serveBackofficeBuild(apiOrigin: string) {
  const build = next(["build"], apiOrigin);
  const [code] = (await once(build.child, "exit")) as [number | null];
  if (code !== 0) throw new Error(`next build exited ${code}:\n${build.output()}`);

  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = next(["start", "-H", "127.0.0.1", "-p", String(port)], apiOrigin);
  const deadline = Date.now() + 60_000;
  while (!(await answers(`${origin}/login`))) {
    if (server.child.exitCode !== null || Date.now() > deadline) {
      await stop(server.child);
      throw new Error(`next start did not come up:\n${server.output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { origin, close: () => stop(server.child) };
}
