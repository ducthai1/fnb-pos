import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const API_DIRECTORY = fileURLToPath(new URL("../../..", import.meta.url));

export interface ApiProcess {
  readonly child: ChildProcess;
  /** Everything printed so far, stdout and stderr apart. */
  readonly output: { stdout: string; stderr: string };
  /** Resolves with the exit code once the process has ended. */
  readonly exited: Promise<number | null>;
}

/**
 * The API's real entrypoint as its own process, with only the environment given (and PATH):
 * nothing of the test runner's environment leaks into the configuration under test.
 */
export function spawnApi(env: Record<string, string>): ApiProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/main.ts"], {
    cwd: API_DIRECTORY,
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk: Buffer) => (output.stdout += chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => (output.stderr += chunk.toString("utf8")));
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { child, output, exited };
}

/** The address the process says it listens on, or an error carrying what it printed. */
export async function listeningUrl(api: ApiProcess, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let ended = false;
  void api.exited.then(() => (ended = true));
  while (Date.now() < deadline) {
    const found = /listening on (http:\/\/\S+)/.exec(api.output.stdout);
    if (found?.[1] !== undefined) return found[1];
    if (ended) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  api.child.kill("SIGKILL");
  throw new Error(`the API did not start:\n${api.output.stdout}\n${api.output.stderr}`);
}
