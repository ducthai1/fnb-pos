// Plays simulated shop days: `pnpm sim:day --seed 7 --days 2 --full`, or `--seeds 1-20`.
// It only turns the flags into the settings the scenario reads and runs it.
import { spawnSync } from "node:child_process";
import console from "node:console";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const range = (text) => {
  const [from, to] = text.split("-").map(Number);
  return to === undefined ? [from] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
};
const seeds = (flagValue("--seeds") ?? flagValue("--seed") ?? "1").split(",").flatMap(range);
if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0)) {
  console.error("seeds are whole numbers: --seed 7, --seed 3,9 or --seeds 1-20");
  process.exit(2);
}
const days = Number(flagValue("--days") ?? 1);
if (!Number.isInteger(days) || days < 1) {
  console.error("--days is a whole number of at least 1");
  process.exit(2);
}
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "--config",
    "vitest.scenarios.config.ts",
    "test/scenarios/simulated-shop-day.test.ts",
  ],
  {
    cwd: packageDir,
    stdio: "inherit",
    env: {
      ...process.env,
      SIM_SEEDS: seeds.join(","),
      SIM_DAYS: String(days),
      SIM_FULL_DAY: args.includes("--full") ? "1" : "0",
    },
  },
);
process.exit(result.status ?? 1);
