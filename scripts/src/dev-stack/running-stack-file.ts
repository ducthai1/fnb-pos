import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { DEV_STACK_PATHS } from "./dev-stack-paths";

const runningStackSchema = z.object({
  /** Where the API listens and which shop it serves: absent while the stack is starting. */
  apiUrl: z.string().url().optional(),
  tenantId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  /** The stack's own process and the children it started, to tell a live stack from a stale file. */
  pids: z.array(z.number().int().positive()),
});

export type RunningStack = z.infer<typeof runningStackSchema>;

const FILE = DEV_STACK_PATHS.runningStack;

export async function writeRunningStack(stack: RunningStack, file = FILE): Promise<void> {
  await writeFile(file, `${JSON.stringify(stack, null, 2)}\n`);
}

export async function removeRunningStack(file = FILE): Promise<void> {
  await rm(file, { force: true });
}

/** What the last start wrote, or null when no stack started or the file is unreadable. */
export async function readRunningStack(file = FILE): Promise<RunningStack | null> {
  try {
    const parsed = runningStackSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The ones of `pids` still alive: signal 0 only asks whether the process exists. */
export function livePids(pids: readonly number[]): number[] {
  return pids.filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  });
}

export type StackClaim = { readonly ok: true } | { readonly ok: false; readonly alive: number[] };

/**
 * Claims the dev stack for this process before it touches anything: the file is created
 * exclusively, so of two starts (one of them with --reset) only one goes on, even while the
 * first is still waiting for next dev and has written nothing else. A file whose processes
 * are all gone is a stack that died without cleaning up, and is taken over.
 */
export async function claimRunningStack(file = FILE, pid = process.pid): Promise<StackClaim> {
  await mkdir(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(file, `${JSON.stringify({ pids: [pid] }, null, 2)}\n`, { flag: "wx" });
      return { ok: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const held = await readRunningStack(file);
    const alive = held === null ? [] : livePids(held.pids);
    if (alive.length > 0) return { ok: false, alive };
    await removeRunningStack(file);
  }
  return { ok: false, alive: [] };
}

/** --reset: everything the stack keeps goes, but the claim of the start doing it. */
export async function clearStackDirectoryButClaim(file = FILE): Promise<void> {
  const directory = dirname(file);
  const entries = await readdir(directory).catch(() => [] as string[]);
  for (const entry of entries) {
    if (entry !== basename(file)) await rm(join(directory, entry), { recursive: true, force: true });
  }
}
