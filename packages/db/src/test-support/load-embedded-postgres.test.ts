import { describe, expect, it } from "vitest";
import { loadEmbeddedPostgres } from "./load-embedded-postgres";

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
});
