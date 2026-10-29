import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packRelease } from "./pack-release";

/**
 * `pnpm release:pack [--no-build] [--out <dir>]`: builds the POS (served under /pos/) and
 * the backoffice, then packs the release into tmp/release-out/. The release id is the POS's
 * version and the short git commit (FNB_RELEASE_ID overrides); it is handed to both builds
 * so the bundle, the faults it reports and the tarball all carry the same one.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = resolve(
  outIndex === -1 ? join(root, "tmp/release-out") : (args[outIndex + 1] ?? ""),
);

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const builtAt = new Date();
const sha = gitSha();
const { version } = JSON.parse(readFileSync(join(root, "apps/pos/package.json"), "utf8")) as {
  version: string;
};
const releaseId =
  process.env.FNB_RELEASE_ID?.trim() ||
  (sha === null
    ? `${version}+local${builtAt.toISOString().replace(/\D/g, "").slice(0, 12)}`
    : `${version}+${sha}`);

if (!args.includes("--no-build")) {
  // Straight through pnpm, not turbo: turbo does not pass FNB_RELEASE_ID to a task.
  const env = { ...process.env, FNB_RELEASE_ID: releaseId };
  for (const build of [
    ["--filter", "@fnb/backoffice", "run", "build"],
    ["--filter", "@fnb/pos", "exec", "vite", "build", "--base=/pos/"],
  ]) {
    const result = spawnSync("pnpm", build, { cwd: root, env, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`release:pack: "pnpm ${build.join(" ")}" failed`);
      process.exit(1);
    }
  }
}

try {
  const packed = await packRelease({ root, outDir, releaseId, gitSha: sha, builtAt });
  console.log(`release:pack: release ${releaseId}`);
  for (const file of [packed.tarball, packed.checksum, packed.manifest]) console.log(`  ${file}`);
} catch (error) {
  console.error(`release:pack: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
