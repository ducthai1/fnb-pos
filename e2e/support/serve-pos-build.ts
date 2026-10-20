import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const POS_ROOT = join(HERE, "../../apps/pos");

/**
 * The POS as it ships: its own Vite config, a production build, served by `vite preview`
 * on a free port with /api forwarded to `apiOrigin`. A dev server would bundle the database
 * Worker differently from what a till gets.
 */
export async function servePosBuild(apiOrigin: string) {
  // Under e2e/tmp (gitignored), one directory per run so parallel sessions never share one.
  const outDir = join(HERE, "../tmp", `pos-${randomUUID()}`);
  // Read by apps/pos/vite.config.ts for the /api proxy of its preview server.
  process.env.FNB_API_ORIGIN = apiOrigin;
  const shared = {
    root: POS_ROOT,
    configFile: join(POS_ROOT, "vite.config.ts"),
    logLevel: "warn" as const,
  };
  try {
    await build({ ...shared, build: { outDir, emptyOutDir: true } });
    const server = await preview({
      ...shared,
      build: { outDir },
      preview: { host: "127.0.0.1", port: 0, strictPort: true },
    });
    const { port } = server.httpServer.address() as AddressInfo;
    return {
      origin: `http://127.0.0.1:${port}`,
      close: async () => {
        await server.close();
        rmSync(outDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}
