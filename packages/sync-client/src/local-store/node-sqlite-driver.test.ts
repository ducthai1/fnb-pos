import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "./local-store-test-support";
import { openNodeSqliteDriver } from "./node-sqlite-driver";

const dir = scratchDirectory("driver");
afterAll(() => dir.remove());

const pragma = (path: string, options?: Parameters<typeof openNodeSqliteDriver>[1]) => {
  const driver = openNodeSqliteDriver(path, options);
  const [journal] = driver.all("PRAGMA journal_mode");
  const [sync] = driver.all("PRAGMA synchronous");
  driver.close();
  return { journal: journal?.journal_mode, synchronous: sync?.synchronous };
};

describe("opening a till database on node:sqlite", () => {
  it("uses WAL and fsyncs every commit (synchronous=FULL) unless told otherwise", () => {
    expect(pragma(join(dir.path, "default.db"))).toEqual({ journal: "wal", synchronous: 2 });
  });

  it("can be set to synchronous=NORMAL, trading the last orders before a power cut for speed", () => {
    expect(pragma(join(dir.path, "normal.db"), { synchronous: "NORMAL" })).toEqual({
      journal: "wal",
      synchronous: 1,
    });
  });
});
