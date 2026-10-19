import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expectGolden } from "./golden-file";

const dirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "printing-golden-"));
  dirs.push(dir);
  return dir;
}
const saved = process.env["UPDATE_GOLDEN"];

afterEach(() => {
  if (saved === undefined) delete process.env["UPDATE_GOLDEN"];
  else process.env["UPDATE_GOLDEN"] = saved;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("golden files", () => {
  it("passes on identical output and fails on different output without rewriting the file", () => {
    delete process.env["UPDATE_GOLDEN"];
    const dir = scratch();
    writeFileSync(join(dir, "slip.txt"), "old\n");
    expect(() => expectGolden("slip.txt", "old\n", dir)).not.toThrow();
    expect(() => expectGolden("slip.txt", "new\n", dir)).toThrow();
    expect(readFileSync(join(dir, "slip.txt"), "utf8")).toBe("old\n");
  });

  it("fails on a missing golden instead of creating it", () => {
    delete process.env["UPDATE_GOLDEN"];
    const dir = scratch();
    expect(() => expectGolden("absent.txt", "x\n", dir)).toThrow(/missing/);
    expect(existsSync(join(dir, "absent.txt"))).toBe(false);
  });

  it("writes the golden only under the update command", () => {
    process.env["UPDATE_GOLDEN"] = "1";
    const dir = scratch();
    expectGolden("slip.txt", "fresh\n", dir);
    expect(readFileSync(join(dir, "slip.txt"), "utf8")).toBe("fresh\n");
  });
});
