import { existsSync } from "node:fs";
import { join } from "node:path";
import { type DevChildProcess, startDevChild } from "./dev-child-process";
import { type DevDatabase, startDevDatabase } from "./dev-stack-database";
import { loadOrGenerateDevStackLogins } from "./dev-stack-generated-logins";
import { DEV_MEDIA_DIRECTORY, DEV_STACK_PATHS, REPO_ROOT } from "./dev-stack-paths";
import { chooseDevStackPorts } from "./dev-stack-ports";
import { printDevStackSummary } from "./print-dev-stack-summary";
import {
  type RunningStack,
  claimRunningStack,
  clearStackDirectoryButClaim,
  removeRunningStack,
  writeRunningStack,
} from "./running-stack-file";
import { waitUntilAnswering } from "./wait-until-answering";

/**
 * `pnpm dev:stack [--reset]`: the whole system on this machine for the owner to try. A
 * Postgres keeping its data in tmp/dev-stack, the sample café seeded, then the API, the POS
 * (vite) and the backoffice (next dev). Ctrl+C stops every process the stack started, by
 * the process groups it gave them; one of them ending on its own stops the rest too. A
 * second Ctrl+C (the first may take a while: next dev is slow to stop) kills them all at
 * once rather than leaving them running without the stack. The stack claims
 * tmp/dev-stack/running-stack.json before anything else, so a second start (with --reset
 * or not) is refused while this one is still coming up.
 */
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--reset")) {
  console.error("Cách dùng: pnpm dev:stack [--reset]");
  process.exit(2);
}
const claim = await claimRunningStack();
if (!claim.ok) {
  const pids = claim.alive.join(", ");
  console.error(
    `Một pnpm dev:stack khác đang chạy hoặc đang khởi động (PID ${pids}). Dừng nó trước: ` +
      "Ctrl+C ở cửa sổ đang chạy nó, hoặc kill <PID> nếu cửa sổ đó đã đóng.",
  );
  process.exit(1);
}
if (args.includes("--reset")) {
  await clearStackDirectoryButClaim();
  console.log("Đã xóa tmp/dev-stack: quán mẫu được dựng lại từ đầu.");
}
const hadData = existsSync(join(DEV_STACK_PATHS.postgresData, "PG_VERSION"));
const { logins, generated } = await loadOrGenerateDevStackLogins(DEV_STACK_PATHS.logins);
if (generated && hadData) {
  console.error(
    "tmp/dev-stack còn dữ liệu cũ nhưng mất credentials.json: chạy pnpm dev:stack --reset",
  );
  await removeRunningStack();
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
  await removeRunningStack();
  process.exit(1);
}

const children: DevChildProcess[] = [];
// Every child is recorded the moment it exists, so a stack that dies before it is up still
// names what it left behind; the writes go one after another.
let recorded: RunningStack = { pids: [process.pid] };
let recording = Promise.resolve();
const record = (change: Partial<RunningStack>) => {
  recorded = { ...recorded, ...change, pids: [process.pid, ...children.map((c) => c.pid)] };
  const snapshot = recorded;
  recording = recording.then(() => writeRunningStack(snapshot)).catch(console.error);
  return recording;
};
let stopping = false;
const stopAll = async (exitCode: number) => {
  if (stopping) return;
  stopping = true;
  for (const child of [...children].reverse()) {
    await child.stop().catch((error: unknown) => console.error(`[${child.name}]`, error));
  }
  await database.stop().catch((error: unknown) => console.error("[postgres]", error));
  await recording;
  await removeRunningStack();
  console.log("Đã dừng tất cả.");
  process.exit(exitCode);
};
const FORCED_DATABASE_STOP_MS = 5_000;
const forceStop = async () => {
  for (const child of children) child.kill();
  const timeout = new Promise((resolve) => setTimeout(resolve, FORCED_DATABASE_STOP_MS).unref());
  await Promise.race([database.stop().catch(() => undefined), timeout]);
  await recording;
  await removeRunningStack();
  console.log("Đã buộc dừng tất cả.");
  process.exit(130);
};
let signalled = 0;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  // Not once: a second signal must not fall back to Node's default, which ends this
  // process at once and leaves every child, in its own process group, running.
  process.on(signal, () => {
    signalled += 1;
    if (signalled === 1) {
      console.log("\nĐang dừng… (Ctrl+C lần nữa để buộc dừng ngay)");
      void stopAll(0);
    } else if (signalled === 2) {
      console.log("Đang buộc dừng…");
      void forceStop();
    }
  });
}

const start = (name: string, command: string, commandArgs: string[], cwd: string, env = {}) => {
  const child = startDevChild(name, command, commandArgs, {
    cwd: join(REPO_ROOT, cwd),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FNB_API_ORIGIN: at(ports.api), ...env },
  });
  children.push(child);
  void record({});
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
      FNB_MEDIA_DIR: DEV_MEDIA_DIRECTORY,
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
  await record({ apiUrl: at(ports.api), tenantId: shop.tenantId, branchId: shop.branchId });
  printDevStackSummary(ports, logins, shop);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stopAll(1);
}
