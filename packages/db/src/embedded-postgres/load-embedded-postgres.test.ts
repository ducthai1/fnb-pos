import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEmbeddedPostgres } from "./load-embedded-postgres";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const LOADER = fileURLToPath(new URL("./load-embedded-postgres.ts", import.meta.url));

describe("loadEmbeddedPostgres", () => {
  it("leaves no exit handler that would override the exit code of a test run", async () => {
    const counts = () => ({
      beforeExit: process.listenerCount("beforeExit"),
      message: process.listenerCount("message"),
      exit: process.listenerCount("exit"),
    });
    const before = counts();
    await loadEmbeddedPostgres();
    expect(counts()).toEqual(before);
  });

  it("keeps the signal handler that stops the server on Ctrl-C", async () => {
    await loadEmbeddedPostgres();
    expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);
  });

  // In a process of its own: the module installs its handlers on the first import only.
  it("removes the signal handlers for a caller that stops its children first", () => {
    const script =
      `const { loadEmbeddedPostgres } = await import(${JSON.stringify(LOADER)});` +
      "const before = ['SIGINT', 'SIGTERM'].map((e) => process.listenerCount(e));" +
      "await loadEmbeddedPostgres({ signalHandlers: 'remove' });" +
      "const after = ['SIGINT', 'SIGTERM'].map((e) => process.listenerCount(e));" +
      "console.log(JSON.stringify({ before, after }));";
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual({ before: [0, 0], after: [0, 0] });
  });
});
