import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDevChild } from "./dev-child-process";
import { REPO_ROOT } from "./dev-stack-paths";
import {
  claimRunningStack,
  clearStackDirectoryButClaim,
  readRunningStack,
  writeRunningStack,
} from "./running-stack-file";

// On the real disk under the repo's tmp/, never in /tmp, like every file the stack keeps.
let directory: string;
let file: string;
beforeEach(async () => {
  await mkdir(join(REPO_ROOT, "tmp"), { recursive: true });
  directory = await mkdtemp(join(REPO_ROOT, "tmp", "dev-stack-claim-"));
  file = join(directory, "running-stack.json");
});
afterEach(() => rm(directory, { recursive: true, force: true }));

/** A pid no process has: one that ran and ended. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolve) => child.once("exit", resolve));
  return child.pid!;
}

describe("claiming the dev stack", () => {
  it("is taken by the first start, and refused to a second while the first lives", async () => {
    expect(await claimRunningStack(file, process.pid)).toEqual({ ok: true });
    // Written at once, before the stack knows its ports or shop.
    expect(await readRunningStack(file)).toEqual({ pids: [process.pid] });
    expect(await claimRunningStack(file, 4_000_000)).toEqual({ ok: false, alive: [process.pid] });
  });

  it("takes over the file of a stack whose processes all ended", async () => {
    const gone = await deadPid();
    await writeRunningStack({ pids: [gone] }, file);
    expect(await claimRunningStack(file, process.pid)).toEqual({ ok: true });
    expect(await readRunningStack(file)).toEqual({ pids: [process.pid] });
  });

  it("is refused while a child of a stack whose own process died still runs", async () => {
    const gone = await deadPid();
    await writeRunningStack({ pids: [gone, process.pid] }, file);
    expect(await claimRunningStack(file, 4_000_000)).toEqual({ ok: false, alive: [process.pid] });
  });

  it("keeps the claim when --reset clears what the stack keeps", async () => {
    await claimRunningStack(file, process.pid);
    await mkdir(join(directory, "postgres-data"));
    await writeFile(join(directory, "credentials.json"), "{}");
    await clearStackDirectoryButClaim(file);
    expect(existsSync(join(directory, "postgres-data"))).toBe(false);
    expect(existsSync(join(directory, "credentials.json"))).toBe(false);
    expect(await readRunningStack(file)).toEqual({ pids: [process.pid] });
  });
});

describe("a forced stop of a dev child", () => {
  it("ends at once a child that ignores the polite stop", async () => {
    const stubborn = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
    const child = startDevChild("stubborn", process.execPath, ["-e", stubborn], {
      cwd: directory,
      env: { PATH: process.env.PATH ?? "" },
    });
    // Let it install its handler, then end it the way a second Ctrl+C does.
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.kill();
    expect(await child.exited).toEqual({ code: null, signal: "SIGKILL" });
  });
});
