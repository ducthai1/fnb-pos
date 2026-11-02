import type { DayContext } from "./day-context";
import { addItems } from "./table-service";
import { openTill } from "./simulated-shop";
import { cashMovePastTheCap } from "./refused-cash-move";
import { scheduleRevokedTill } from "./revoked-till";

const MINUTE = 60_000;

/** The build the shop's tills are updated to when the server starts to refuse the old one. */
export const UPDATED_POS_BUILD = 2_000;

export interface IncidentChoices {
  /** Which till loses its network for twenty minutes at the lunch peak. */
  readonly offline: string;
  /** Which till's clock is wrong, and by how much (ms; negative is behind). */
  readonly skewed: { readonly device: string; readonly byMs: number };
  /** Whether the server restarts, and the build update happens, during the day. */
  readonly serverRestart: boolean;
  readonly appUpdate: boolean;
  readonly sameTableTwice: boolean;
}

export function chooseIncidents(random: {
  pick<T>(items: readonly T[]): T;
  int(a: number, b: number): number;
}): IncidentChoices {
  return {
    offline: random.pick(["counter-1", "counter-2", "handheld"]),
    skewed: {
      device: random.pick(["counter-1", "counter-2", "handheld", "bar"]),
      byMs: random.pick([1, -1]) * random.int(1, 8) * MINUTE,
    },
    serverRestart: true,
    appUpdate: true,
    sameTableTwice: true,
  };
}

/** Where in the day (0..1) each trouble hits, so a short day and a long one meet the same ones. */
const AT = {
  offline: 0.42,
  restart: 0.55,
  update: 0.72,
  sameTable: 0.38,
  cashPastCap: 0.3,
  revokedTill: 0.2,
} as const;

/** Schedules the day's troubles; each is a task like the cashiers' own. */
export function scheduleIncidents(ctx: DayContext, choices: IncidentChoices): string[] {
  const { openMs, closeMs } = ctx.window;
  const at = (fraction: number) => openMs + Math.round((closeMs - openMs) * fraction);
  const happened: string[] = [];
  const task = (dueMs: number, label: string, run: () => Promise<boolean>) =>
    ctx.tasks.push({ label, dueMs, run });

  ctx.device(choices.skewed.device).skewMs = choices.skewed.byMs;
  happened.push(`clock of ${choices.skewed.device} ${choices.skewed.byMs / MINUTE} min`);

  const offline = ctx.device(choices.offline);
  task(at(AT.offline), "network cut", async () => {
    offline.till.network.online = false;
    return true;
  });
  task(at(AT.offline) + 20 * MINUTE, "network back", async () => {
    offline.till.network.online = true;
    return true;
  });
  happened.push(`${choices.offline} offline 20 min`);

  if (choices.sameTableTwice) {
    task(at(AT.sameTable), "two tills add to one table", async () => {
      const handheld = ctx.device("handheld");
      const counter = ctx.device("counter-1");
      for (const order of ctx.books.orders.values()) {
        if (order.kind !== "table" || order.state !== "open" || order.frozen || order.billed)
          continue;
        const [a, b] = await Promise.all([
          handheld.till.client.snapshot("order", order.id),
          counter.till.client.snapshot("order", order.id),
        ]);
        const quiet =
          (await handheld.till.client.pendingCount()) +
            (await counter.till.client.pendingCount()) ===
          0;
        if (!quiet || a === null || b === null || a.serverVersion !== b.serverVersion) continue;
        // Both tills have the same table in front of them and add a drink before either syncs.
        await addItems(ctx, handheld, order, [ctx.item()]);
        await addItems(ctx, counter, order, [ctx.item()]);
        happened.push(`two tills added to ${order.id}`);
        return true;
      }
      return false;
    });
  }

  // The cashier's counter: a cash move past the cap, refused, then set aside with approval.
  task(at(AT.cashPastCap), "cash move past the cap", () =>
    cashMovePastTheCap(ctx, ctx.device("counter-2")),
  );
  happened.push("refused cash move set aside with a manager's approval");

  // A spare till revoked while it holds cash sales, flushed under a manager's code, paired again.
  ctx.books.revokedTill = scheduleRevokedTill(ctx, at(AT.revokedTill));
  if (ctx.books.revokedTill !== null)
    happened.push(`spare till revoked and flushed (${ctx.books.revokedTill.variant})`);

  if (choices.serverRestart) {
    task(at(AT.restart), "server restarts", async () => {
      await ctx.shop.server.restart();
      return true;
    });
    happened.push("server restart");
  }

  if (choices.appUpdate) {
    task(at(AT.update), "server requires the new build", async () => {
      await ctx.shop.server.requirePosBuild(UPDATED_POS_BUILD);
      // Tills reload into the new build one after another, some minutes apart.
      ctx.shop.devices.forEach((device, index) => {
        task(ctx.now() + (10 + index * 7) * MINUTE, `${device.name} updates`, async () => {
          await device.till.network.drain();
          await device.till.close();
          device.posBuild = UPDATED_POS_BUILD;
          device.till = openTill(ctx.shop, device);
          return true;
        });
      });
      return true;
    });
    happened.push("app update to the minimum build");
  }
  return happened;
}
