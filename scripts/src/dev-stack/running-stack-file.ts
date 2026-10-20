import { readFile, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { DEV_STACK_PATHS } from "./dev-stack-paths";

const runningStackSchema = z.object({
  apiUrl: z.string().url(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  /** The stack's own process and the children it started, to tell a live stack from a stale file. */
  pids: z.array(z.number().int().positive()),
});

export type RunningStack = z.infer<typeof runningStackSchema>;

export async function writeRunningStack(stack: RunningStack): Promise<void> {
  await writeFile(DEV_STACK_PATHS.runningStack, `${JSON.stringify(stack, null, 2)}\n`);
}

export async function removeRunningStack(): Promise<void> {
  await rm(DEV_STACK_PATHS.runningStack, { force: true });
}

/** What the last start wrote, or null when no stack started or the file is unreadable. */
export async function readRunningStack(): Promise<RunningStack | null> {
  try {
    const parsed = runningStackSchema.safeParse(
      JSON.parse(await readFile(DEV_STACK_PATHS.runningStack, "utf8")),
    );
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
