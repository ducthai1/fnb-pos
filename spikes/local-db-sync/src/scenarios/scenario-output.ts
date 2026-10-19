import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPIKE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RESULTS_DIR = join(SPIKE_DIR, "results");

/**
 * Scenario data lives on the real disk under the spike's git-ignored `tmp/`. On this machine
 * /tmp is tmpfs, where fsync costs nothing and every commit looks ten times cheaper.
 */
export function makeScenarioDir(label: string): string {
  const base = join(SPIKE_DIR, "tmp");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, `${label}-${process.pid}-`));
}

/** Measurements are committed as JSON next to the spike, so the report's numbers can be traced. */
export function writeScenarioResult(name: string, result: unknown): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, `${name}.json`);
  const json = JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  writeFileSync(path, `${json}\n`);
  return path;
}

export async function measureMs<T>(work: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await work();
  return [value, Math.round(performance.now() - start)];
}
