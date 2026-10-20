import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    browserPagesOrigin: string;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, "pages");

/**
 * Builds the test pages the way the POS is built (Worker and WASM bundled) and serves the
 * build with Vite on a free port: a dev server would bundle Workers differently than the
 * till gets them, and may reload the page mid-run when it discovers a dependency.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  // Under the package's tmp/ (gitignored), like the other test files of this package.
  const outDir = join(HERE, "../../tmp", `browser-pages-${randomUUID()}`);
  const shared = { configFile: false as const, root: PAGES, logLevel: "warn" as const };
  await build({
    ...shared,
    worker: { format: "es" },
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          contract: join(PAGES, "contract.html"),
          singleTab: join(PAGES, "single-tab.html"),
        },
      },
    },
  });
  const server = await preview({
    ...shared,
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const { port } = server.httpServer.address() as AddressInfo;
  project.provide("browserPagesOrigin", `http://127.0.0.1:${port}`);
  return async () => {
    await server.close();
    rmSync(outDir, { recursive: true, force: true });
  };
}
