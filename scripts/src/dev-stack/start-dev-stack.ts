import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { type DevChildProcess, startDevChild } from "./dev-child-process";
import { type DevDatabase, startDevDatabase } from "./dev-stack-database";
import { loadOrGenerateDevStackLogins } from "./dev-stack-generated-logins";
import { DEV_STACK_DIRECTORY, DEV_STACK_PATHS, REPO_ROOT } from "./dev-stack-paths";
import { chooseDevStackPorts } from "./dev-stack-ports";
import { printDevStackSummary } from "./print-dev-stack-summary";
import {
  livePids,
  readRunningStack,
  removeRunningStack,
  writeRunningStack,
} from "./running-stack-file";
import { waitUntilAnswering } from "./wait-until-answering";

/**
 * `pnpm dev:stack [--reset]`: the whole system on this machine for the owner to try. A
 * Postgres keeping its data in tmp/dev-stack, the sample café seeded, then the API, the POS
 * (vite) and the backoffice (next dev). Ctrl+C stops every process the stack started, by
 * the process groups it gave them; one of them ending on its own stops the rest too.
 */
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--reset")) {
  console.error("Cách dùng: pnpm dev:stack [--reset]");
  process.exit(2);
}
const previous = await readRunningStack();
const alive = previous === null ? [] : livePids(previous.pids);
if (alive.length > 0) {
  console.error(`Một pnpm dev:stack khác đang chạy (PID ${alive.join(", ")}). Dừng nó trước.`);
  process.exit(1);
}
if (args.includes("--reset")) {
  await rm(DEV_STACK_DIRECTORY, { recursive: true, force: true });
  console.log("Đã xóa tmp/dev-stack: quán mẫu được dựng lại từ đầu.");
}
const hadData = existsSync(join(DEV_STACK_PATHS.postgresData, "PG_VERSION"));
const { logins, generated } = await loadOrGenerateDevStackLogins(DEV_STACK_PATHS.logins);
if (generated && hadData) {
  console.error(
    "tmp/dev-stack còn dữ liệu cũ nhưng mất credentials.json: chạy pnpm dev:stack --reset",
  );
  process.exit(1);
}
const ports = await chooseDevStackPorts();
const at = (port: number) => `http://127.0.0.1:${port}`;

console.log("Đang khởi động Postgres, cấp quyền, chạy migration và dựng quán mẫu…");
let database: DevDatabase;
try {
  database = await startDevDatabase(ports.postgres, logins);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const children: DevChildProcess[] = [];
let stopping = false;
const stopAll = async (exitCode: number) => {
  if (stopping) return;
  stopping = true;
  for (const child of [...children].reverse()) {
    await child.stop().catch((error: unknown) => console.error(`[${child.name}]`, error));
  }
  await database.stop().catch((error: unknown) => console.error("[postgres]", error));
  await removeRunningStack();
  console.log("Đã dừng tất cả.");
  process.exit(exitCode);
};
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log("\nĐang dừng…");
    void stopAll(0);
  });
}

const start = (name: string, command: string, commandArgs: string[], cwd: string, env = {}) => {
  const child = startDevChild(name, command, commandArgs, {
    cwd: join(REPO_ROOT, cwd),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FNB_API_ORIGIN: at(ports.api), ...env },
  });
  children.push(child);
  void child.exited.then(({ code, signal }) => {
    if (stopping) return;
    console.error(`${name} đã dừng bất ngờ (${code ?? signal}): dừng cả hệ thống.`);
    void stopAll(1);
  });
  return child;
};

try {
  const origins = [ports.pos, ports.backoffice].flatMap((port) => [
    at(port),
    `http://localhost:${port}`,
  ]);
  const api = start(
    "api",
    process.execPath,
    ["--import", "tsx", "src/server/main.ts"],
    "apps/api",
    {
      FNB_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(ports.api),
      FNB_DATABASE_URL: database.appUrl,
      FNB_PAYMENT_SECRET_KEY: logins.paymentSecretKey,
      FNB_EINVOICE_PROVIDER: "fake",
      FNB_ALLOWED_ORIGINS: origins.join(","),
    },
  );
  await waitUntilAnswering(`${at(ports.api)}/health`, api, 60_000);
  const bin = (app: string, name: string) =>
    join(REPO_ROOT, "apps", app, "node_modules/.bin", name);
  const pos = start(
    "pos",
    bin("pos", "vite"),
    ["--host", "127.0.0.1", "--port", String(ports.pos), "--strictPort"],
    "apps/pos",
  );
  const backoffice = start(
    "backoffice",
    bin("backoffice", "next"),
    ["dev", "-H", "127.0.0.1", "-p", String(ports.backoffice)],
    "apps/backoffice",
  );
  await waitUntilAnswering(at(ports.pos), pos, 60_000);
  await waitUntilAnswering(at(ports.backoffice), backoffice, 240_000);
  const { shop } = database;
  const pids = [process.pid, ...children.map((child) => child.pid)];
  await writeRunningStack({
    apiUrl: at(ports.api),
    tenantId: shop.tenantId,
    branchId: shop.branchId,
    pids,
  });
  printDevStackSummary(ports, logins, shop);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stopAll(1);
}
