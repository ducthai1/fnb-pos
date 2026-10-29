import { chmodSync, existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PackedRelease, packRelease } from "./pack-release";

/** A throwaway directory under the machine's temp directory (TMPDIR is honoured). */
export const scratchDirectory = (label: string) => mkdtempSync(join(tmpdir(), `fnb-${label}-`));

function write(root: string, path: string, content: string) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

/**
 * A tiny repo with everything a release needs, as `pnpm build:server` would leave it: the
 * POS build stamped with `releaseId`, a backoffice build (and its cache, which must not
 * ship), the API source, two workspace packages, the migrations named, and a test file that
 * must stay out.
 */
export function makeBuiltRepo(root: string, releaseId: string, migrations: readonly string[]) {
  write(root, "package.json", '{"name":"fnb-pos","private":true}\n');
  write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  write(root, "apps/api/package.json", '{"name":"@fnb/api"}\n');
  write(root, "apps/api/src/server/main.ts", "export {};\n");
  write(root, "apps/api/src/build-app.test.ts", "// a test, left out\n");
  write(root, "apps/pos/package.json", '{"name":"@fnb/pos","version":"1.2.3"}\n');
  write(root, "apps/pos/src/main.tsx", "// the POS source is left out\n");
  write(root, "apps/pos/dist/index.html", "<html></html>\n");
  write(root, "apps/pos/dist/assets/app-abc123.js", "console.log(1);\n");
  write(root, "apps/pos/dist/version.json", `${JSON.stringify({ releaseId })}\n`);
  write(root, "apps/backoffice/package.json", '{"name":"@fnb/backoffice"}\n');
  write(root, "apps/backoffice/next.config.ts", "export default {};\n");
  write(root, "apps/backoffice/dist/BUILD_ID", "build\n");
  write(root, "apps/backoffice/dist/cache/webpack/big.pack", "cache\n");
  write(root, "packages/db/package.json", '{"name":"@fnb/db"}\n');
  write(root, "packages/db/src/index.ts", "export {};\n");
  write(root, "packages/db/src/index.test.ts", "// a test, left out\n");
  for (const name of migrations) write(root, `packages/db/migrations/${name}`, `-- ${name}\n`);
  write(root, "scripts/package.json", '{"name":"@fnb/scripts"}\n');
  write(root, "scripts/src/ops/backup-cli.ts", "export {};\n");
  write(root, "e2e/package.json", '{"name":"@fnb/e2e"}\n');
  write(root, "e2e/spec.ts", "// left out\n");
  write(root, "docs/plan.md", "# left out\n");
  write(root, "infra/release/install-release.sh", "#!/bin/sh\n");
}

/** Packs a one-off release into `outDir` from a repo of its own. */
export async function packFixtureRelease(
  outDir: string,
  releaseId: string,
  migrations: readonly string[],
): Promise<PackedRelease> {
  const root = scratchDirectory("repo");
  makeBuiltRepo(root, releaseId, migrations);
  return packRelease({ root, outDir, releaseId, gitSha: "abc1234", builtAt: new Date(0) });
}

/** Commands stood in for systemctl, pnpm and curl: each logs its call, none needs root. */
export function makeCommandStubs(directory: string, logFile: string, stateDirectory: string) {
  mkdirSync(directory, { recursive: true });
  mkdirSync(stateDirectory, { recursive: true });
  const stub = (name: string, body: string) => {
    const path = join(directory, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  };
  stub("systemctl", `echo "systemctl $*" >> "${logFile}"`);
  stub(
    "pnpm",
    [
      `echo "pnpm $* (in $(basename "$(pwd -P)"))" >> "${logFile}"`,
      // STUB_FAIL_PNPM names the one pnpm call that must fail.
      `[ "$1" = "\${STUB_FAIL_PNPM:-}" ] && exit 1`,
      "exit 0",
    ].join("\n"),
  );
  // Healthy unless `current` points at the release named in state/unhealthy-release.
  stub(
    "curl",
    [
      `bad="$(cat "${stateDirectory}/unhealthy-release" 2>/dev/null || true)"`,
      `now="$(basename "$(readlink "$FNB_BASE_DIR/current")")"`,
      `echo "curl $now" >> "${logFile}"`,
      `[ -n "$bad" ] && [ "$bad" = "$now" ] && exit 22`,
      "exit 0",
    ].join("\n"),
  );
}

/** Moves every release directory into the past, so the next one to go live is the newest. */
export function ageReleases(releasesDirectory: string, names: readonly string[]) {
  const base = Date.now() / 1000 - 3_600;
  const present = names.filter((name) => existsSync(join(releasesDirectory, name)));
  present.forEach((name, index) => {
    const at = base - (present.length - index) * 60;
    utimesSync(join(releasesDirectory, name), at, at);
  });
}
