import { type SeededRandom, seededRandom } from "../support/seeded-random";
import { syncUntilConverged } from "../support/scenario-till";
import { DayContext, type DayWindow } from "./day-context";
import { type IncidentChoices, chooseIncidents, scheduleIncidents } from "./incidents";
import { counterSale } from "./counter-service";
import { ShopBooks } from "./shop-books";
import { FIRST_DAY_START, type SimulatedShop, signIn, signInAll } from "./simulated-shop";
import { closeDrawers, openDrawers, payOutOfDrawer } from "./shifts";
import { redoStaleDrafts } from "./redo-stale-drafts";
import { seatParty } from "./table-service";
import { vietnamMinuteOfDay } from "./world-clock";

const MINUTE = 60_000;

export interface DayProfile {
  /** Minutes the clock moves between two rounds of the cashiers' work and the tills' syncs. */
  readonly tickMinutes: number;
  /** Opening and closing, in minutes since midnight in Vietnam. */
  readonly opensAt: number;
  readonly closesAt: number;
}

/** A shop's whole trading day. */
export const FULL_DAY: DayProfile = { tickMinutes: 2, opensAt: 7 * 60, closesAt: 22 * 60 };
/** Morning to mid-afternoon, with the lunch peak and every trouble in it: short enough for CI. */
export const SHORT_DAY: DayProfile = { tickMinutes: 3, opensAt: 10 * 60, closesAt: 15 * 60 };

/** Chance, per till and tick, that a customer comes: quiet mornings, a lunch peak, a thin afternoon. */
function footfall(minuteOfDay: number): number {
  if (minuteOfDay >= 11 * 60 + 30 && minuteOfDay < 13 * 60 + 30) return 0.6;
  if (minuteOfDay < 11 * 60 + 30) return 0.12;
  return minuteOfDay < 17 * 60 ? 0.2 : 0.1;
}

export interface DayRun {
  readonly ctx: DayContext;
  readonly books: ShopBooks;
  readonly window: DayWindow;
  readonly incidents: IncidentChoices;
  readonly happened: string[];
}

async function runDueTasks(ctx: DayContext): Promise<void> {
  const due = ctx.tasks.filter((task) => task.dueMs <= ctx.now());
  for (const task of due) {
    if (await task.run()) ctx.tasks.splice(ctx.tasks.indexOf(task), 1);
  }
}

/** Each till syncs once; one whose staff session has ended gets its cashier's PIN again. */
async function syncRound(shop: SimulatedShop): Promise<void> {
  for (const device of shop.devices) {
    if (!device.till.network.online) continue;
    const { failure } = await device.till.client.syncOnce();
    if (failure?.code === "API_STAFF_SESSION_INVALID") await signIn(shop, device);
  }
}

/**
 * One trading day of the shop: the drawers open, customers come and go through the
 * morning, the lunch peak and the afternoon while things go wrong, and everything is closed
 * out. The shop is left synced with every order settled, ready to be checked.
 */
export async function runDay(
  shop: SimulatedShop,
  books: ShopBooks,
  dayIndex: number,
  seed: number,
  profile: DayProfile,
  options: { incidents?: Partial<IncidentChoices> } = {},
): Promise<DayRun> {
  const random: SeededRandom = seededRandom(seed * 1_000 + dayIndex);
  const dayStart = FIRST_DAY_START + dayIndex * 24 * 60 * MINUTE;
  const window: DayWindow = {
    businessDate: new Date(dayStart + 7 * 60 * MINUTE).toISOString().slice(0, 10),
    openMs: dayStart + (profile.opensAt - 7 * 60) * MINUTE,
    closeMs: dayStart + (profile.closesAt - 7 * 60) * MINUTE,
    tickMs: profile.tickMinutes * MINUTE,
  };
  const ctx = new DayContext(shop, books, random, window);
  shop.world.advanceTo(window.openMs);
  if (dayIndex > 0) await signInAll(shop);
  await openDrawers(ctx);
  const incidents = { ...chooseIncidents(random), ...options.incidents };
  const happened = scheduleIncidents(ctx, incidents);
  const lastOrder = window.closeMs - 40 * MINUTE;

  for (let tickAt = window.openMs; tickAt < window.closeMs; tickAt += window.tickMs) {
    shop.world.advanceTo(tickAt);
    await runDueTasks(ctx);
    const chance = footfall(vietnamMinuteOfDay(tickAt));
    if (tickAt < lastOrder) {
      for (const device of shop.devices) {
        if (device.role === "counter" && random.chance(chance)) await counterSale(ctx, device);
        if (device.role === "handheld" && random.chance(chance * 0.6)) await seatParty(ctx, device);
        if (device.role === "counter" && random.chance(0.01))
          await payOutOfDrawer(ctx, device, 30_000);
      }
    }
    await syncRound(shop);
    await redoStaleDrafts(ctx);
  }

  await settleTheDay(ctx);
  return { ctx, books, window, incidents, happened };
}

/** After closing: every customer is served or gone, the tills are all back and in step, the drawers are counted. */
async function settleTheDay(ctx: DayContext): Promise<void> {
  const { shop, window } = ctx;
  let tickAt = window.closeMs;
  // Troubles that outlast closing end first: the network is back, the tills are on the newest build.
  for (let round = 0; ctx.tasks.length > 0; round += 1) {
    if (round > 200) {
      const state = await Promise.all(
        shop.devices.map(
          async (device) =>
            `${device.name}: ${await device.till.client.pendingCount()} waiting, build ${device.posBuild}, last pass ${JSON.stringify((await device.till.client.syncOnce()).failure)}, refused ${(await device.till.client.rejectedCommands()).map((entry) => `${entry.command.type}:${entry.code}`).join(",")}`,
        ),
      );
      throw new Error(
        `tasks left at the close: ${ctx.tasks.map((task) => task.label).join(", ")} (${state.join("; ")})`,
      );
    }
    tickAt += window.tickMs;
    shop.world.advanceTo(tickAt);
    for (const device of shop.devices) device.till.network.online = true;
    await runDueTasks(ctx);
    await syncRound(shop);
    await redoStaleDrafts(ctx);
  }
  for (const device of shop.devices) device.till.network.online = true;
  await convergeRedoing(ctx);
  await closeDrawers(ctx);
  await convergeRedoing(ctx);
}

/** Syncs every till until nothing moves, redoing any draft a till was told to save again. */
async function convergeRedoing(ctx: DayContext): Promise<void> {
  const tills = ctx.shop.devices.map((device) => device.till);
  for (let round = 0; round < 10; round += 1) {
    await syncUntilConverged(tills);
    await redoStaleDrafts(ctx);
    const waiting = await Promise.all(tills.map((till) => till.client.pendingCount()));
    if (waiting.every((count) => count === 0)) return;
  }
  throw new Error("the tills never settled");
}
