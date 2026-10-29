import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { selectReleaseFiles } from "./release-files";
import { SUMS_FILE, buildManifest, sha256OfFile, sumsText } from "./release-manifest";

/**
 * What `next start` needs of the backoffice's config. The source config is TypeScript, which
 * Next can only read with the `typescript` package installed (a development dependency that
 * `pnpm install --prod` leaves out); the build already carries the rewrites and every other
 * setting, so the server reads this plain file, which only says where the build is.
 */
const BACKOFFICE_RUNTIME_CONFIG = `export default { distDir: "dist", poweredByHeader: false };\n`;

export interface PackInput {
  /** The repo root, with `pnpm build:server`'s output already in place. */
  readonly root: string;
  readonly outDir: string;
  readonly releaseId: string;
  readonly gitSha: string | null;
  readonly builtAt: Date;
}

export interface PackedRelease {
  readonly tarball: string;
  readonly checksum: string;
  readonly manifest: string;
}

/** Files a release cannot run without; a missing one means the build step did not run. */
const REQUIRED = [
  "apps/api/src/server/main.ts",
  "apps/pos/dist/index.html",
  "apps/pos/dist/version.json",
  "apps/backoffice/dist",
  "packages/db/migrations",
  "pnpm-lock.yaml",
  "infra/release/install-release.sh",
];

/** The release id the POS build stamped into `version.json`. */
function stampedReleaseId(root: string): string {
  const text = readFileSync(join(root, "apps/pos/dist/version.json"), "utf8");
  const id = (JSON.parse(text) as { releaseId?: unknown } | null)?.releaseId;
  return typeof id === "string" ? id : "";
}

function listFiles(root: string, relative = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(root, path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

/**
 * Packs the built repo into `fnb-<id>.tar.gz` plus its `.sha256` and `.manifest.json` in
 * outDir. Inside the tarball are the manifest's checksums as SHA256SUMS, RELEASE_ID and the
 * migration names as migrations.txt, which the install and rollback scripts read with
 * nothing but a shell. The tarball is made the same way every time (sorted, no owner, no
 * times) so equal contents give equal bytes.
 */
export async function packRelease(input: PackInput): Promise<PackedRelease> {
  const missing = REQUIRED.filter((path) => !existsSync(join(input.root, path)));
  if (missing.length > 0) {
    throw new Error(
      `nothing to pack, build first (pnpm build:server); missing: ${missing.join(", ")}`,
    );
  }
  const stamped = stampedReleaseId(input.root);
  if (stamped !== input.releaseId) {
    throw new Error(
      `the POS build is stamped "${stamped}" but this release is "${input.releaseId}"`,
    );
  }
  const migrations = readdirSync(join(input.root, "packages/db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  mkdirSync(input.outDir, { recursive: true });
  const stage = join(input.outDir, `.stage-${process.pid}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    for (const path of selectReleaseFiles(input.root)) {
      mkdirSync(dirname(join(stage, path)), { recursive: true });
      copyFileSync(join(input.root, path), join(stage, path));
    }
    writeFileSync(join(stage, "apps/backoffice/next.config.mjs"), BACKOFFICE_RUNTIME_CONFIG);
    writeFileSync(join(stage, "RELEASE_ID"), `${input.releaseId}\n`);
    writeFileSync(join(stage, "migrations.txt"), migrations.map((name) => `${name}\n`).join(""));
    const sums = new Map<string, string>();
    for (const path of listFiles(stage)) sums.set(path, await sha256OfFile(join(stage, path)));
    writeFileSync(join(stage, SUMS_FILE), sumsText(sums));

    const base = `fnb-${input.releaseId}`;
    const tarball = join(input.outDir, `${base}.tar.gz`);
    execFileSync("tar", [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      tarball,
      "-C",
      stage,
      ".",
    ]);
    const sha256 = await sha256OfFile(tarball);
    const checksum = `${tarball}.sha256`;
    writeFileSync(checksum, `${sha256}  ${base}.tar.gz\n`);
    const manifest = join(input.outDir, `${base}.manifest.json`);
    const body = buildManifest({
      releaseId: input.releaseId,
      gitSha: input.gitSha,
      builtAt: input.builtAt,
      tarball: { file: `${base}.tar.gz`, sha256, bytes: statSync(tarball).size },
      migrations,
      sums,
    });
    writeFileSync(manifest, `${JSON.stringify(body, null, 2)}\n`);
    return { tarball, checksum, manifest };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
