// The same LocalStore + sync loop on SQLite WASM (opfs-sahpool, in a Worker) in headless
// Chrome: 2,000 offline orders, sync, reload the page, then 500 more under network faults.
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildBrowserBundle } from "../browser/build-browser-bundle";
import { registerBrowserAssets } from "../browser/serve-browser-assets";
import type { FaultPlan } from "../faults/faulty-fetch";
import type { QueuedCommand } from "../local-store/local-store";
import { makePostgresDir, startEmbeddedPostgres } from "../server/start-embedded-postgres";
import { startSyncServer } from "../server/sync-server-app";
import { canonicalState } from "../shared/canonical-state";
import { snapshotFromWire } from "../shared/order-wire-codec";
import type { OrderSnapshotWire } from "../shared/sync-wire-types";
import { auditServer, auditTill, readServerSnapshots } from "./audit-sync-outcome";
import { makeScenarioDir, writeScenarioResult } from "./scenario-output";

const FAULTS: FaultPlan = {
  dropRequest: 0.1,
  dropResponse: 0.15,
  delay: 0.3,
  maxDelayMs: 80,
  duplicate: 0.1,
  lateDelivery: 0.1,
  lateDelayMs: [50, 600],
};

interface BrowserState {
  cursor: string;
  stateHash: string;
  snapshots: OrderSnapshotWire[];
  commands: QueuedCommand[];
  pagesBytes: number;
}

await buildBrowserBundle();
const root = makeScenarioDir("browser-opfs");
const postgres = await startEmbeddedPostgres(makePostgresDir("browser", root));
const server = await startSyncServer({ connectionString: postgres.connectionString, register: registerBrowserAssets });
// Our own profile directory and a pipe (not a debugging port): nothing here can attach to,
// or be attached by, another Chrome on this machine. Closing the context closes only it.
const context = await chromium.launchPersistentContext(join(root, "chrome-profile"), {
  executablePath: "/usr/bin/google-chrome",
  headless: true,
});

async function compare(state: BrowserState) {
  const truth = await readServerSnapshots(server.pool);
  const serverHash = createHash("sha256").update(canonicalState(truth)).digest("hex").slice(0, 16);
  const view = {
    listCommands: async () => state.commands,
    listOrderSnapshots: async () => state.snapshots.map(snapshotFromWire),
  };
  return { serverHash, browserHash: state.stateHash, till: await auditTill(view, truth), server: await auditServer(server.pool) };
}

try {
  const page = context.pages()[0] ?? (await context.newPage());
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  const load = async () => {
    const response = await page.goto(`${server.url}/spike/index.html`);
    await page.waitForFunction(() => typeof (window as unknown as { runPhase?: unknown }).runPhase === "function");
    return response?.status();
  };
  const run = <T>(phase: string, args: Record<string, unknown> = {}) =>
    page.evaluate(
      ([p, a]) => (window as unknown as { runPhase: (p: string, a: unknown) => Promise<unknown> }).runPhase(p, a),
      [phase, args] as const,
    ) as Promise<T>;

  const firstLoadStatus = await load();
  const firstOpen = await run("open");
  const offlineWrites = await run("writeOffline", { orders: 2_000, seed: 1 });
  const firstSync = await run("sync", { seed: 2 });
  const firstState = await run<BrowserState>("state");
  const firstCheck = await compare(firstState);
  await run("close");

  const reloadStatus = await load();
  const reopened = await run("open");
  const secondRun = await run("workloadUnderFaults", { orders: 500, seed: 3, faults: FAULTS });
  // opfs-sahpool holds exclusive OPFS handles: a second tab of the same origin cannot open
  // the pool while this one has it.
  const secondTab = await context.newPage();
  await secondTab.goto(`${server.url}/spike/index.html`);
  await secondTab.waitForFunction(() => typeof (window as unknown as { runPhase?: unknown }).runPhase === "function");
  const secondTabOpen = await Promise.race([
    secondTab
      .evaluate(() => (window as unknown as { runPhase: (p: string) => Promise<unknown> }).runPhase("open"))
      .then((value) => ({ opened: true, value }), (error: Error) => ({ opened: false, error: error.message.split("\n")[0] })),
    new Promise((resolve) => setTimeout(() => resolve({ opened: false, error: "no answer within 15 s" }), 15_000)),
  ]);
  await secondTab.close();
  const secondState = await run<BrowserState>("state");
  const secondCheck = await compare(secondState);
  await run("close");

  // Durability knobs a web till could turn, 500 orders each on a fresh file.
  const variants: Record<string, unknown>[] = [];
  for (const [name, pragmas] of [
    ["synchronous NORMAL", ["PRAGMA synchronous = NORMAL"]],
    ["journal PERSIST", ["PRAGMA journal_mode = PERSIST"]],
    ["exclusive lock + WAL", ["PRAGMA locking_mode = EXCLUSIVE", "PRAGMA journal_mode = WAL"]],
    ["journal OFF (unsafe)", ["PRAGMA journal_mode = OFF"]],
  ] as const) {
    const opened = await run<{ pragmaAnswers: unknown; journalMode: string }>("open", { file: `/variant-${variants.length}.db`, pragmas });
    const writes = await run<{ latency: unknown }>("writeOffline", { orders: 500, seed: 4 });
    await run("close");
    variants.push({ name, pragmaAnswers: opened.pragmaAnswers, journalMode: opened.journalMode, latency: writes.latency });
  }

  const result = {
    chrome: context.browser()?.version() ?? "persistent context",
    firstLoadStatus,
    firstOpen,
    offlineWrites,
    firstSync: { ...(firstSync as object) },
    firstCheck: { ...firstCheck, cursor: firstState.cursor, pagesBytes: firstState.pagesBytes },
    reloadStatus,
    reopened,
    secondRun,
    secondCheck: { ...secondCheck, cursor: secondState.cursor, pagesBytes: secondState.pagesBytes },
    secondTabOpen,
    variants,
    pageErrors: pageErrors.slice(0, 20),
  };
  console.log(`wrote ${writeScenarioResult("browser-opfs", result)}`);
} finally {
  await context.close();
  await server.close();
  await postgres.stop();
  rmSync(root, { recursive: true, force: true });
}
