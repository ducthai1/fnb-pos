import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build, preview } from "vite";
import { servePhotos } from "./support/serve-hostile-photos";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    screensOrigin: string;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, "pages");

/** Builds the screens page as the POS is built and serves it on a free port. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  // Under the app's tmp/ (gitignored), so a run leaves nothing in the source tree.
  const outDir = join(HERE, "../../tmp", `screens-${randomUUID()}`);
  const shared = { configFile: false as const, root: PAGES, logLevel: "warn" as const };
  await build({
    ...shared,
    plugins: [react()],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: join(PAGES, "screens.html") } },
  });
  const server = await preview({
    ...shared,
    plugins: [servePhotos()],
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const { port } = server.httpServer.address() as AddressInfo;
  project.provide("screensOrigin", `http://127.0.0.1:${port}`);
  return async () => {
    await server.close();
    rmSync(outDir, { recursive: true, force: true });
  };
}
