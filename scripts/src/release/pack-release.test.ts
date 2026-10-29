import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packRelease } from "./pack-release";
import { makeBuiltRepo, packFixtureRelease, scratchDirectory } from "./release-test-support";

const made: string[] = [];
const scratch = (label: string) => {
  const directory = scratchDirectory(label);
  made.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const listTarball = (tarball: string) =>
  execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.replace(/^\.\//, ""))
    .filter((line) => line !== "" && !line.endsWith("/"));

describe("packing a release", () => {
  it("ships what the server runs and leaves out tests, sources of the front ends and caches", async () => {
    const out = scratch("out");
    const { tarball } = await packFixtureRelease(out, "1.2.3+abc1234", [
      "0001_a.sql",
      "0002_b.sql",
    ]);
    const files = listTarball(tarball);
    expect(files).toContain("apps/api/src/server/main.ts");
    expect(files).toContain("apps/pos/dist/version.json");
    expect(files).toContain("apps/backoffice/dist/BUILD_ID");
    expect(files).toContain("packages/db/migrations/0002_b.sql");
    expect(files).toContain("apps/backoffice/package.json");
    // next start reads a plain config: the TypeScript one needs a dev dependency.
    expect(files).toContain("apps/backoffice/next.config.mjs");
    expect(files).not.toContain("apps/backoffice/next.config.ts");
    for (const left of [
      "apps/api/src/build-app.test.ts",
      "packages/db/src/index.test.ts",
      "apps/pos/src/main.tsx",
      "apps/backoffice/dist/cache/webpack/big.pack",
      "docs/plan.md",
      "e2e/spec.ts",
    ]) {
      expect(files).not.toContain(left);
    }
  });

  it("writes the release id, the migration list, the sums and a manifest that agrees with them", async () => {
    const out = scratch("out");
    const packed = await packFixtureRelease(out, "1.2.3+abc1234", ["0001_a.sql", "0002_b.sql"]);
    const manifest = JSON.parse(readFileSync(packed.manifest, "utf8"));
    expect(manifest).toMatchObject({
      releaseId: "1.2.3+abc1234",
      gitSha: "abc1234",
      migrations: ["0001_a.sql", "0002_b.sql"],
      tarball: { file: "fnb-1.2.3+abc1234.tar.gz" },
    });
    const sumsFile = scratch("unpacked");
    execFileSync("tar", ["-xzf", packed.tarball, "-C", sumsFile]);
    expect(readFileSync(join(sumsFile, "RELEASE_ID"), "utf8")).toBe("1.2.3+abc1234\n");
    expect(readFileSync(join(sumsFile, "migrations.txt"), "utf8")).toBe("0001_a.sql\n0002_b.sql\n");
    execFileSync("sha256sum", ["--check", "--quiet", "SHA256SUMS"], { cwd: sumsFile });
    for (const [path, sum] of Object.entries(manifest.files)) {
      expect(readFileSync(join(sumsFile, "SHA256SUMS"), "utf8")).toContain(`${sum}  ${path}\n`);
    }
    execFileSync("sha256sum", ["--check", "--quiet", `${packed.tarball}.sha256`], {
      cwd: out,
    });
    expect(manifest.tarball.sha256).toBe(readFileSync(packed.checksum, "utf8").split(" ")[0]);
  });

  it("makes the same bytes from the same contents", async () => {
    const first = await packFixtureRelease(scratch("one"), "1.2.3+abc1234", ["0001_a.sql"]);
    const second = await packFixtureRelease(scratch("two"), "1.2.3+abc1234", ["0001_a.sql"]);
    expect(readFileSync(first.checksum, "utf8")).toBe(readFileSync(second.checksum, "utf8"));
  });

  it("leaves nothing but the three artifacts in the output directory", async () => {
    const out = scratch("out");
    await packFixtureRelease(out, "1.2.3+abc1234", ["0001_a.sql"]);
    expect(readdirSync(out).sort()).toEqual([
      "fnb-1.2.3+abc1234.manifest.json",
      "fnb-1.2.3+abc1234.tar.gz",
      "fnb-1.2.3+abc1234.tar.gz.sha256",
    ]);
  });

  it("refuses when the build did not run, and when the POS is stamped with another release", async () => {
    const empty = scratch("empty");
    mkdirSync(join(empty, "apps"));
    mkdirSync(join(empty, "packages"));
    const attempt = (root: string, releaseId: string) =>
      packRelease({ root, outDir: scratch("out"), releaseId, gitSha: null, builtAt: new Date(0) });
    await expect(attempt(empty, "x")).rejects.toThrow(/build first/);
    const repo = scratch("repo");
    makeBuiltRepo(repo, "1.2.3+abc1234", ["0001_a.sql"]);
    await expect(attempt(repo, "9.9.9+other")).rejects.toThrow(/stamped "1.2.3\+abc1234"/);
  });
});
