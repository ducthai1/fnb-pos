import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { FULL_DAY, SHORT_DAY, runDay } from "../simulation/day-runner";
import { checkEndOfDay } from "../simulation/end-of-day-checks";
import { ShopBooks } from "../simulation/shop-books";
import { openShop } from "../simulation/simulated-shop";

/**
 * A whole shop's day, played by virtual cashiers on tills running the real sync client
 * against the real API, with things going wrong, then checked against the shop's own books.
 * Two short days run with the rest of the sync scenarios; `pnpm sim:day --seed 7 --days 3
 * --full` plays others (see the handbook's page on the simulated shop).
 */
const seeds = (process.env.SIM_SEEDS ?? "1,2").split(",").map(Number);
const days = Number(process.env.SIM_DAYS ?? 1);
const profile = process.env.SIM_FULL_DAY === "1" ? FULL_DAY : SHORT_DAY;
const MINUTES = 60_000;

const dir = scratchDirectory("simulated-shop-day");
afterAll(() => dir.remove());

describe.each(seeds)("a simulated shop day, seed %i", (seed) => {
  it(
    `ends with the shop's books and the system agreeing, over ${days} day(s)`,
    async () => {
      // Each seed is a different shop, so its tills keep their databases apart.
      const seedDir = join(dir.path, `seed-${seed}`);
      mkdirSync(seedDir, { recursive: true });
      const shop = await openShop(seed, seedDir);
      try {
        let earlier = { commands: 0, refused: 0 };
        const violations: string[] = [];
        for (let day = 0; day < days; day += 1) {
          const books = new ShopBooks(earlier);
          // The deploy that raises the minimum build happens once; later days start on it.
          const run = await runDay(
            shop,
            books,
            day,
            seed,
            profile,
            day === 0 ? {} : { incidents: { appUpdate: false } },
          );
          const check = await checkEndOfDay(run);
          console.info(
            `seed ${seed} day ${day + 1}: ${JSON.stringify(check.facts)}; ${run.happened.join("; ")}`,
          );
          violations.push(...check.violations.map((violation) => `day ${day + 1}: ${violation}`));
          earlier = {
            commands: Number(check.facts.commands),
            refused: Number(check.facts.refused),
          };
        }
        expect(
          violations,
          `replay with: pnpm sim:day --seed ${seed} --days ${days}${profile === FULL_DAY ? " --full" : ""}`,
        ).toEqual([]);
      } finally {
        await Promise.all(shop.devices.map((device) => device.till.close()));
        await shop.server.close();
      }
    },
    40 * MINUTES,
  );
});
