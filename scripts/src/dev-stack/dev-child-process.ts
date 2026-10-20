import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface DevChildProcess {
  readonly name: string;
  readonly pid: number;
  /** Resolves once the process has ended, with how it ended. */
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Asks the process and everything it started to stop, then makes sure they have. */
  stop(): Promise<void>;
}

const STOP_GRACE_MS = 8_000;

/**
 * Starts a child of the dev stack in a process group of its own, so stopping it reaches the
 * workers it starts in turn (next dev runs one) by the group's id, which is this child's
 * pid: nothing the stack did not start is ever signalled. Its output is printed line by
 * line under its name.
 */
export function startDevChild(
  name: string,
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): DevChildProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid === undefined) throw new Error(`${name} could not be started`);
  const pid = child.pid;
  for (const stream of [child.stdout, child.stderr]) {
    if (stream === null) continue;
    createInterface({ input: stream }).on("line", (line) => console.log(`[${name}] ${line}`));
  }
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  return { name, pid, exited, stop: () => stopGroup(child, pid, exited) };
}

async function stopGroup(child: ChildProcess, pid: number, exited: Promise<unknown>) {
  signalGroup(pid, "SIGTERM");
  const ended = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), STOP_GRACE_MS).unref()),
  ]);
  // The leader may have ended while a worker of its group still runs; the group goes too.
  signalGroup(pid, "SIGKILL");
  if (!ended && child.exitCode === null) await exited;
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    // ESRCH: the group is already gone.
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
