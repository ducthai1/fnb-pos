import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { ManualClock } from "../support/manual-clock";
import {
  type LineIntent,
  line,
  orderIdOf,
  pushOnTime as pushOnTimeBy,
  saveDraft,
} from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";

const info = inject("testPostgres");
const HOUR = 60 * 60_000;

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** An hour from the backoffice clock, as the till's clock dates a command. */
const inHours = (hours: number) => new Date(clock.now().getTime() + hours * HOUR).toISOString();

const markSoldOut = (productId: string, body: Record<string, unknown> = {}) =>
  expectStatus(
    app.inject({
      method: "PUT",
      url: "/catalog/availability",
      headers: { cookie: s.shop.managerCookie },
      payload: { productId, branchId: s.shop.branchId, available: false, ...body },
    }),
    200,
  );
const putBack = (productId: string, channelKey: string | null = null) =>
  expectStatus(
    app.inject({
      method: "PUT",
      url: "/catalog/availability",
      headers: { cookie: s.shop.managerCookie },
      payload: { productId, branchId: s.shop.branchId, channelKey, available: true },
    }),
    200,
  );

const pushOnTime = (sent: SyncCommandEnvelope) => pushOnTimeBy(app, s.tillA, clock, sent);

function draftAt(
  createdAt: string,
  lines: LineIntent[],
  order: { orderId?: string; channelKey?: string | null } = {},
) {
  return { ...saveDraft(s.tillA, lines, order), createdAt };
}

describe("order.save_draft and sold-out products", () => {
  it("refuses a product the branch marked sold out, and sells everything else", async () => {
    await markSoldOut(s.menu.coffee.id);
    const coffee = draftAt(inHours(1), [line(s.menu.coffee.id)]);
    expect(await pushOnTime(coffee)).toEqual({
      commandId: coffee.commandId,
      status: "rejected",
      code: "SYNC_PRODUCT_SOLD_OUT",
    });
    const tea = draftAt(inHours(1), [
      line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM }),
    ]);
    expect((await pushOnTime(tea)).status).toBe("accepted");
    await putBack(s.menu.coffee.id);
    const later = draftAt(inHours(1), [line(s.menu.coffee.id)]);
    expect((await pushOnTime(later)).status).toBe("accepted");
  });

  it("refuses it only on the channel it ran out for", async () => {
    await markSoldOut(s.menu.coffee.id, { channelKey: "grab" });
    const onGrab = draftAt(inHours(1), [line(s.menu.coffee.id)], { channelKey: "grab" });
    const atCounter = draftAt(inHours(1), [line(s.menu.coffee.id)]);
    expect((await pushOnTime(onGrab)).code).toBe("SYNC_PRODUCT_SOLD_OUT");
    expect((await pushOnTime(atCounter)).status).toBe("accepted");
    await putBack(s.menu.coffee.id, "grab");
  });

  it("keeps a sale the till made before the product was marked, even when it syncs after", async () => {
    await markSoldOut(s.menu.coffee.id);
    const beforeTheMark = draftAt(inHours(-1), [line(s.menu.coffee.id)]);
    expect((await pushOnTime(beforeTheMark)).status).toBe("accepted");
    await putBack(s.menu.coffee.id);
  });

  it("sells it again once the time it was marked off until has passed", async () => {
    await markSoldOut(s.menu.coffee.id, { unavailableUntil: inHours(2) });
    const during = draftAt(inHours(1), [line(s.menu.coffee.id)]);
    const after = draftAt(inHours(3), [line(s.menu.coffee.id)]);
    expect((await pushOnTime(during)).code).toBe("SYNC_PRODUCT_SOLD_OUT");
    expect((await pushOnTime(after)).status).toBe("accepted");
    await putBack(s.menu.coffee.id);
  });

  it("lets a draft keep the units it already had, but not add more", async () => {
    const coffee = line(s.menu.coffee.id);
    const first = draftAt(inHours(1), [coffee]);
    await pushOnTime(first);
    await markSoldOut(s.menu.coffee.id);
    const tea = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });
    const orderId = orderIdOf(first);
    const withTea = draftAt(inHours(1), [coffee, tea], { orderId });
    expect((await pushOnTime(withTea)).status).toBe("accepted");
    const twoCoffees = draftAt(inHours(1), [{ ...coffee, quantity: "2" }, tea], { orderId });
    expect((await pushOnTime(twoCoffees)).code).toBe("SYNC_PRODUCT_SOLD_OUT");
    await putBack(s.menu.coffee.id);
  });
});
