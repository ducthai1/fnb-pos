import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BROWSER_BUILD_DIR = join(HERE, "../../tmp/browser-build");

/** Where the published sqlite-wasm files (index.mjs, sqlite3.wasm) live inside node_modules. */
export const SQLITE_WASM_DIR = join(
  dirname(createRequire(import.meta.url).resolve("@sqlite.org/sqlite-wasm/package.json")),
  "dist",
);

// sqlite-wasm finds sqlite3.wasm relative to its own module URL, so it is served untouched
// from /vendor instead of being bundled (bundling would need the .wasm copied by hand).
const sqliteWasmFromVendor: Plugin = {
  name: "sqlite-wasm-from-vendor",
  setup(builder) {
    builder.onResolve({ filter: /^@sqlite\.org\/sqlite-wasm$/ }, () => ({
      path: "/vendor/sqlite-wasm/index.mjs",
      external: true,
    }));
  },
};

const PAGE_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>spike opfs</title></head>
<body><script type="module" src="/spike/page-main.js"></script></body></html>
`;

export async function buildBrowserBundle(): Promise<void> {
  mkdirSync(BROWSER_BUILD_DIR, { recursive: true });
  await build({
    entryPoints: [join(HERE, "opfs-worker.ts"), join(HERE, "page-main.ts")],
    outdir: BROWSER_BUILD_DIR,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    plugins: [sqliteWasmFromVendor],
    logLevel: "warning",
  });
  writeFileSync(join(BROWSER_BUILD_DIR, "index.html"), PAGE_HTML);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildBrowserBundle();
