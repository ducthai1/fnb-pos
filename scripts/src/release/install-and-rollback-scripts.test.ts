import { spawnSync } from "node:child_process";
import {
  existsSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ageReleases,
  makeCommandStubs,
  packFixtureRelease,
  scratchDirectory,
} from "./release-test-support";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "../../../infra/release");

/** The server in miniature: a base directory, stand-in commands, and packed releases. */
let base: string;
let stubs: string;
let state: string;
let log: string;
let artifacts: string;

beforeEach(() => {
  const root = scratchDirectory("server");
  base = join(root, "srv");
  stubs = join(root, "bin");
  state = join(root, "state");
  log = join(root, "calls.log");
  artifacts = join(root, "artifacts");
  writeFileSync(log, "");
  makeCommandStubs(stubs, log, state);
});
afterEach(() => rmSync(dirname(base), { recursive: true, force: true }));

/** `launcher` goes in front of the script, e.g. a `flock` that holds the release lock. */
function run(
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  launcher: string[] = [],
) {
  const command = [...launcher, "bash", join(SCRIPTS, script), ...args];
  const result = spawnSync(command[0]!, command.slice(1), {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH ?? ""}`,
      FNB_BASE_DIR: base,
      FNB_SUDO: "",
      FNB_SYSTEMCTL: "systemctl",
      FNB_HEALTH_TRIES: "2",
      FNB_HEALTH_WAIT: "0",
      FNB_BACKUP_COMMAND: "pnpm ops:backup",
      FNB_PROVISION_COMMAND: "pnpm db:provision",
      ...extraEnv,
    },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const release = (id: string, migrations: string[]) => packFixtureRelease(artifacts, id, migrations);
const install = (tarball: string, env: Record<string, string> = {}) =>
  run("install-release.sh", [tarball], env);
const calls = () =>
  readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "");
const live = () => basename(readlinkSync(join(base, "current")));
const releases = () => readdirSync(join(base, "releases")).sort();

describe("installing a release", () => {
  it("extracts, installs production dependencies, migrates, switches and restarts, with no backup on a first install", async () => {
    const first = await release("1.0.0+aaa", ["0001_a.sql"]);
    const result = install(first.tarball);
    expect(result.status, result.err).toBe(0);
    expect(live()).toBe("1.0.0+aaa");
    expect(existsSync(join(base, "releases/1.0.0+aaa/apps/pos/dist/version.json"))).toBe(true);
    expect(
      calls().filter((line) => line.startsWith("pnpm") || line.startsWith("systemctl")),
    ).toEqual([
      "pnpm install --frozen-lockfile --prod (in 1.0.0+aaa)",
      "pnpm db:provision (in 1.0.0+aaa)",
      "systemctl restart fnb-api fnb-backoffice",
    ]);
  });

  it("with --no-start stops after switching, before any restart or health check", async () => {
    const first = await release("1.0.0+aaa", ["0001_a.sql"]);
    const result = run("install-release.sh", ["--no-start", first.tarball]);
    expect(result.status, result.err).toBe(0);
    expect(live()).toBe("1.0.0+aaa");
    expect(calls().some((line) => line.startsWith("systemctl") || line.startsWith("curl"))).toBe(
      false,
    );
    expect(calls()).toContain("pnpm db:provision (in 1.0.0+aaa)");
  });

  it("backs up before it migrates, and migrates before it switches", async () => {
    await install((await release("1.0.0+aaa", ["0001_a.sql"])).tarball);
    writeFileSync(log, "");
    const second = await release("1.1.0+bbb", ["0001_a.sql", "0002_b.sql"]);
    const result = install(second.tarball);
    expect(result.status, result.err).toBe(0);
    const order = calls().filter((line) => /ops:backup|db:provision|restart/.test(line));
    expect(order).toEqual([
      "pnpm ops:backup (in 1.0.0+aaa)",
      "pnpm db:provision (in 1.1.0+bbb)",
      "systemctl restart fnb-api fnb-backoffice",
    ]);
    expect(live()).toBe("1.1.0+bbb");
    expect(releases()).toEqual(["1.0.0+aaa", "1.1.0+bbb"]);
  });

  it("refuses a tarball that does not match its checksum, and changes nothing", async () => {
    const packed = await release("1.0.0+aaa", ["0001_a.sql"]);
    appendFileSync(packed.tarball, "tampered");
    const result = install(packed.tarball);
    expect(result.status).toBe(1);
    expect(result.err).toContain("does not match its checksum");
    expect(existsSync(join(base, "current"))).toBe(false);
    expect(calls()).toEqual([]);
  });

  it("refuses a tarball with no checksum file", async () => {
    const packed = await release("1.0.0+aaa", ["0001_a.sql"]);
    rmSync(packed.checksum);
    expect(install(packed.tarball).status).toBe(1);
    expect(existsSync(join(base, "releases"))).toBe(false);
  });

  it("stops before switching when the backup or the migrations fail", async () => {
    await install((await release("1.0.0+aaa", ["0001_a.sql"])).tarball);
    const second = await release("1.1.0+bbb", ["0001_a.sql", "0002_b.sql"]);
    for (const failing of ["ops:backup", "db:provision"]) {
      writeFileSync(log, "");
      const result = install(second.tarball, { STUB_FAIL_PNPM: failing });
      expect(result.status).toBe(1);
      expect(live()).toBe("1.0.0+aaa");
      expect(calls().some((line) => line.startsWith("systemctl"))).toBe(false);
    }
  });

  it("switches back to the previous release and exits 1 when the new one never answers /health", async () => {
    await install((await release("1.0.0+aaa", ["0001_a.sql"])).tarball);
    writeFileSync(log, "");
    writeFileSync(join(state, "unhealthy-release"), "1.1.0+bbb");
    const result = install((await release("1.1.0+bbb", ["0001_a.sql", "0002_b.sql"])).tarball);
    expect(result.status).toBe(1);
    expect(result.err).toContain("switched back to 1.0.0+aaa");
    expect(result.out).toContain("also has: 0002_b.sql");
    expect(live()).toBe("1.0.0+aaa");
    expect(calls().filter((line) => line.startsWith("systemctl"))).toHaveLength(2);
    // Set aside, so a later rollback with no id cannot land on the release that just failed.
    expect(releases().filter((name) => !name.startsWith("."))).toEqual(["1.0.0+aaa"]);
    expect(releases().some((name) => name.startsWith(".failed-1.1.0+bbb-"))).toBe(true);
    expect(run("rollback-release.sh", []).err).toContain("no other release to go back to");
  });

  it("keeps the newest five releases, and never the live or the previous one out of them", async () => {
    const ids = ["1.0.0+a", "1.1.0+b", "1.2.0+c", "1.3.0+d", "1.4.0+e", "1.5.0+f", "1.6.0+g"];
    for (const [index, id] of ids.entries()) {
      if (index > 0) ageReleases(join(base, "releases"), ids.slice(0, index));
      const result = install((await release(id, ["0001_a.sql"])).tarball);
      expect(result.status, result.err).toBe(0);
    }
    expect(live()).toBe("1.6.0+g");
    expect(releases()).toEqual(["1.2.0+c", "1.3.0+d", "1.4.0+e", "1.5.0+f", "1.6.0+g"]);
  });

  it("keeps the previous release's POS files in the new one for tills still running it, one release back only", async () => {
    const assetsOf = (id: string) =>
      readdirSync(join(base, "releases", id, "apps/pos/dist/assets")).sort();
    expect(install((await release("1.0.0+aaa", ["0001_a.sql"])).tarball).status).toBe(0);
    ageReleases(join(base, "releases"), ["1.0.0+aaa"]);
    const second = install((await release("1.1.0+bbb", ["0001_a.sql"])).tarball);
    expect(second.status, second.err).toBe(0);
    expect(assetsOf("1.1.0+bbb")).toEqual(["app-100aaa.js", "app-110bbb.js"]);
    // The file kept is the previous release's own, byte for byte, and the new one is not touched.
    expect(
      readFileSync(join(base, "releases/1.1.0+bbb/apps/pos/dist/assets/app-100aaa.js"), "utf8"),
    ).toContain("1.0.0+aaa");
    expect(
      readFileSync(join(base, "releases/1.1.0+bbb/apps/pos/dist/assets/app-110bbb.js"), "utf8"),
    ).toContain("1.1.0+bbb");

    ageReleases(join(base, "releases"), ["1.0.0+aaa", "1.1.0+bbb"]);
    expect(install((await release("1.2.0+ccc", ["0001_a.sql"])).tarball).status).toBe(0);
    // Two releases back is no longer carried: tills that old are told to update.
    expect(assetsOf("1.2.0+ccc")).toEqual(["app-110bbb.js", "app-120ccc.js"]);
  });

  it("will not install the release that is already running", async () => {
    const packed = await release("1.0.0+aaa", ["0001_a.sql"]);
    expect(install(packed.tarball).status).toBe(0);
    const again = install(packed.tarball);
    expect(again.status).toBe(1);
    expect(again.err).toContain("is the one running now");
  });
});

describe("rolling back", () => {
  async function twoReleases(secondMigrations: string[]) {
    await install((await release("1.0.0+aaa", ["0001_a.sql"])).tarball);
    ageReleases(join(base, "releases"), ["1.0.0+aaa"]);
    await install((await release("1.1.0+bbb", secondMigrations)).tarball);
    writeFileSync(log, "");
  }

  it("goes back to the previous release when the release it leaves added no migration", async () => {
    await twoReleases(["0001_a.sql"]);
    const result = run("rollback-release.sh", []);
    expect(result.status, result.err).toBe(0);
    expect(live()).toBe("1.0.0+aaa");
    expect(calls()).toContain("systemctl restart fnb-api fnb-backoffice");
  });

  it("refuses when the release it leaves added migrations, names them, and changes nothing", async () => {
    await twoReleases(["0001_a.sql", "0002_b.sql"]);
    const result = run("rollback-release.sh", []);
    expect(result.status).toBe(1);
    expect(result.err).toContain("REFUSED");
    expect(result.err).toContain("0002_b.sql");
    expect(result.err).toContain("--after-migration-i-understand");
    expect(live()).toBe("1.1.0+bbb");
    expect(calls()).toEqual([]);
  });

  it("goes back anyway with --after-migration-i-understand", async () => {
    await twoReleases(["0001_a.sql", "0002_b.sql"]);
    const result = run("rollback-release.sh", ["--after-migration-i-understand"]);
    expect(result.status, result.err).toBe(0);
    expect(live()).toBe("1.0.0+aaa");
  });

  it("goes to a named release, and refuses one that is not there or is already running", async () => {
    await twoReleases(["0001_a.sql"]);
    expect(run("rollback-release.sh", ["9.9.9+none"]).status).toBe(1);
    expect(run("rollback-release.sh", ["1.1.0+bbb"]).err).toContain("already the running release");
    expect(run("rollback-release.sh", ["1.0.0+aaa"]).status).toBe(0);
    expect(live()).toBe("1.0.0+aaa");
  });

  it("will not run while another install or rollback holds the release lock", async () => {
    await twoReleases(["0001_a.sql"]);
    const result = run("rollback-release.sh", [], {}, ["flock", join(base, ".release.lock")]);
    expect(result.status).toBe(1);
    expect(result.err).toContain("another install or rollback is running");
    expect(live()).toBe("1.1.0+bbb");
    expect(calls()).toEqual([]);
  });

  it("fails when the release it went back to does not answer /health", async () => {
    await twoReleases(["0001_a.sql"]);
    writeFileSync(join(state, "unhealthy-release"), "1.0.0+aaa");
    const result = run("rollback-release.sh", []);
    expect(result.status).toBe(1);
    expect(result.err).toContain("did not answer");
  });
});
