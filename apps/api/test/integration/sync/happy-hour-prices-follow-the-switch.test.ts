import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { OrderSnapshot } from "../../../src/sync/sync-wire-types";
import { expectStatus } from "../support/catalog-shop";
import { line, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const TEA_M = 35_000;

let pool: pg.Pool;
let app: FastifyInstance;
const clock = tillsClock();
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
  // Peach tea at half price from 14:00 to 17:00, Vietnam time, and a 10% cut all day.
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/price-lists/${newId()}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        name: "Giá",
        items: [
          {
            id: newId(),
            scope: { kind: "product", productId: s.menu.peachTea.id },
            timeWindow: { startMinute: 840, endMinute: 1020 },
            effect: { kind: "percent_off", rateBp: 5000, rounding: "half-up" },
          },
        ],
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const setHappyHour = (value: boolean) =>
  expectStatus(
    app.inject({
      method: "PUT",
      url: `/settings/brand/${s.brandId}/happy_hour_pricing`,
      headers: { cookie: s.shop.managerCookie },
      payload: { value },
    }),
    200,
  );

/** The price of a peach tea drafted at 15:00 Vietnam time. */
async function teaPriceAtHappyHour() {
  const before = clock.now().getTime();
  const toHappyHour = Date.parse("2026-10-20T08:00:00.000Z") - before;
  clock.advance(toHappyHour);
  try {
    const draft = {
      ...saveDraft(s.tillA, [line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM })]),
      createdAt: clock.now().toISOString(),
    };
    const saved = await pushOne(app, s.tillA, draft);
    expect(saved.status).toBe("accepted");
    return (saved.snapshot as OrderSnapshot | undefined)?.lines[0]?.unitPrice;
  } finally {
    clock.advance(-toHappyHour);
  }
}

describe("a price that applies only in certain hours", () => {
  it("is not given while the happy-hour switch is off, which is how a shop starts", async () => {
    expect(await teaPriceAtHappyHour()).toBe(TEA_M);
  });

  it("is given once the brand turns the switch on, and stops again when it is turned off", async () => {
    await setHappyHour(true);
    expect(await teaPriceAtHappyHour()).toBe(TEA_M / 2);
    await setHappyHour(false);
    expect(await teaPriceAtHappyHour()).toBe(TEA_M);
  });
});
