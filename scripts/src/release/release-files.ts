import { existsSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

/** Directories never shipped, wherever they sit. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "tmp", "test", "coverage", ".turbo"]);
const TEST_FILE = /\.test\.tsx?$/;

/** Every workspace package's manifest: the lockfile is checked against them on install. */
const WORKSPACE_PARENTS = ["apps", "packages"];
const WORKSPACE_SINGLES = ["scripts", "e2e"];

/** What each part of the repo contributes: sources that run as TypeScript, builds that were made. */
const SOURCE_TREES = ["apps/api/src", "scripts/src", "infra"];
const BUILT_TREES = ["apps/pos/dist", "apps/backoffice/dist"];
const PACKAGE_TREES = ["src", "migrations"];
const ROOT_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".nvmrc",
  "tsconfig.base.json",
  "apps/api/tsconfig.json",
  "apps/backoffice/tsconfig.json",
  "scripts/tsconfig.json",
];

function walk(root: string, relative: string, found: string[], sources: boolean) {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      // A build is shipped whole, apart from Next's cache, which the running server never
      // reads; a source tree leaves out tests.
      if (sources && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (entry.name === "node_modules" || path.endsWith("/dist/cache")) continue;
      walk(root, path, found, sources);
    } else if (entry.isFile() && !(sources && TEST_FILE.test(entry.name))) {
      found.push(path);
    }
  }
}

/**
 * The files of a release, as paths from the repo root with forward slashes, sorted. What
 * runs on the server: the API and shared packages as TypeScript (the API is started with
 * tsx), the migrations, the ops scripts, `infra/`, the two builds, and every workspace's
 * package.json so `pnpm install --frozen-lockfile --prod` can check the lockfile. Tests,
 * the POS and backoffice sources and the docs stay out.
 */
export function selectReleaseFiles(root: string): string[] {
  const found: string[] = [];
  const addTree = (tree: string, sources: boolean) => {
    if (existsSync(join(root, tree))) walk(root, tree, found, sources);
  };
  for (const parent of WORKSPACE_PARENTS) {
    for (const name of readdirSync(join(root, parent))) {
      if (!statSync(join(root, parent, name)).isDirectory()) continue;
      const manifest = `${parent}/${name}/package.json`;
      if (existsSync(join(root, manifest))) found.push(manifest);
      if (parent === "packages") {
        for (const tree of PACKAGE_TREES) addTree(`packages/${name}/${tree}`, true);
        const config = `packages/${name}/tsconfig.json`;
        if (existsSync(join(root, config))) found.push(config);
      }
    }
  }
  for (const single of WORKSPACE_SINGLES) {
    if (existsSync(join(root, single, "package.json"))) found.push(`${single}/package.json`);
  }
  for (const file of ROOT_FILES) if (existsSync(join(root, file))) found.push(file);
  for (const tree of SOURCE_TREES) addTree(tree, true);
  for (const tree of BUILT_TREES) addTree(tree, false);
  return [...new Set(found)].sort();
}
