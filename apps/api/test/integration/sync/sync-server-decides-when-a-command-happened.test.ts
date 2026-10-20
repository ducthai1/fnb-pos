import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { FakeEInvoiceProvider } from "../../../src/einvoice/providers/fake-einvoice-provider";
import type { OrderSnapshot, SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { expectStatus } from "../support/catalog-shop";
import { saveEInvoiceProfile } from "../support/einvoice-profiles";
import { rowsOf } from "../support/shift-commands";
import {
  SERVER_STARTS_AT,
  line,
  orderIdOf,
  pay,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TEA_M = 35_000;

let pool: pg.Pool;
let app: FastifyInstance;
const clock = tillsClock();
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock, einvoiceProviders: [new FakeEInvoiceProvider()] });
  s = await syncShop(app, pool);
  await saveEInvoiceProfile(pool, s.shop.tenantId, {
    scopeKind: "branch",
    scopeId: s.shop.branchId,
  });
  // Happy hour: peach tea at half price from 14:00 to 17:00, Vietnam time.
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/price-lists/${newId()}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        name: "Giờ vàng",
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

/** An instant `ms` away from when the server (at SERVER_STARTS_AT, 10:01) receives commands. */
const fromServer = (ms: number) => new Date(SERVER_STARTS_AT.getTime() + ms).toISOString();

const teaDraftAt = (createdAt: string): SyncCommandEnvelope => ({
  ...saveDraft(s.tillA, [line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM })]),
  createdAt,
});

const priceOf = (result: { snapshot?: unknown }) =>
  (result.snapshot as OrderSnapshot).lines[0]?.unitPrice;

const clampsOf = (commandId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT actor_kind, actor_id, entity_id, payload FROM audit_log " +
      "WHERE action = 'sync.device_clock_clamped' AND payload->>'commandId' = $1",
    [commandId],
  );

describe("a command from a till whose clock is off", () => {
  it("is refused three minutes fast, storing nothing of it, and the till moves on", async () => {
    const fast = teaDraftAt(fromServer(3 * MINUTE));
    expect(await pushOne(app, s.tillA, fast)).toMatchObject({
      status: "rejected",
      code: "SYNC_DEVICE_CLOCK_AHEAD",
    });
    const stored = "SELECT count(*)::int AS n FROM sales_order WHERE id = $1";
    expect(await rowsOf(pool, s.shop.tenantId, stored, [orderIdOf(fast)])).toEqual([{ n: 0 }]);
    expect((await pushOne(app, s.tillA, teaDraftAt(fromServer(-MINUTE)))).status).toBe("accepted");
  });

  it("is taken one minute fast at the till's own time, and not noted", async () => {
    const sent = teaDraftAt(fromServer(MINUTE));
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
    expect(await clampsOf(sent.commandId)).toEqual([]);
  });

  it("prices a sale on a till a little fast across the start of happy hour as the till did", async () => {
    // 13:59:10 on the server, 14:00:40 on the till: inside the forgiven two minutes.
    const before = clock.now().getTime();
    const toHappyHour = Date.parse("2026-10-20T06:59:10.000Z") - before;
    clock.advance(toHappyHour);
    try {
      const deviceAt = new Date(clock.now().getTime() + 90_000).toISOString();
      const draft = teaDraftAt(deviceAt);
      const saved = await pushOne(app, s.tillA, draft);
      expect(priceOf(saved)).toBe(TEA_M / 2);
      const paid = await pushOne(app, s.tillA, {
        ...pay(s.tillA, orderIdOf(draft), TEA_M / 2),
        createdAt: deviceAt,
      });
      expect(paid.status).toBe("accepted");
      // The same tea a few seconds before happy hour on the till is the full price.
      const early = teaDraftAt(new Date(clock.now().getTime() + 30_000).toISOString());
      expect(priceOf(await pushOne(app, s.tillA, early))).toBe(TEA_M);
    } finally {
      clock.advance(-toHappyHour);
    }
  });

  it("is not noted when the till's clock is right", async () => {
    const sent = teaDraftAt(fromServer(-MINUTE));
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
    expect(await clampsOf(sent.commandId)).toEqual([]);
  });

  it("gets no happy-hour price by setting the till's clock to happy hour", async () => {
    // 15:00 today is five hours ahead of the server: refused.
    const today = await pushOne(app, s.tillA, teaDraftAt("2026-10-20T08:00:00.000Z"));
    expect(today).toMatchObject({ status: "rejected", code: "SYNC_DEVICE_CLOCK_AHEAD" });
    // 15:00 yesterday is held at 12 hours back, 22:01 yesterday: no happy hour then.
    const yesterday = teaDraftAt("2026-10-19T08:00:00.000Z");
    const result = await pushOne(app, s.tillA, yesterday);
    expect(result.status).toBe("accepted");
    expect(priceOf(result)).toBe(TEA_M);
    expect((await clampsOf(yesterday.commandId))[0]?.payload).toMatchObject({
      effectiveAt: fromServer(-12 * HOUR),
      clampedByMs: Date.parse("2026-10-19T08:00:00.000Z") - Date.parse(fromServer(-12 * HOUR)),
    });
  });

  it("is taken 13 hours behind, dated and paid 12 hours back, both clocks kept", async () => {
    const recorded = fromServer(-13 * HOUR);
    const draft = teaDraftAt(recorded);
    const saved = await pushOne(app, s.tillA, draft);
    expect((saved.snapshot as OrderSnapshot).businessDate).toBe("2026-10-19");
    const paid = { ...pay(s.tillA, orderIdOf(draft), TEA_M), createdAt: recorded };
    expect((await pushOne(app, s.tillA, paid)).status).toBe("accepted");
    const heldAt = new Date(fromServer(-12 * HOUR));
    const times = { device: new Date(recorded), received: SERVER_STARTS_AT };
    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT business_date::text AS day, paid_at, paid_at_device, paid_received_at " +
          "FROM sales_order WHERE id = $1",
        [orderIdOf(draft)],
      ),
    ).toEqual([
      {
        day: "2026-10-19",
        paid_at: heldAt,
        paid_at_device: times.device,
        paid_received_at: times.received,
      },
    ]);
    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT sold_at, sold_at_device, sold_received_at FROM einvoice WHERE order_id = $1",
        [orderIdOf(draft)],
      ),
    ).toEqual([
      { sold_at: heldAt, sold_at_device: times.device, sold_received_at: times.received },
    ]);
    expect(await clampsOf(paid.commandId)).toMatchObject([
      { payload: { skewMs: -13 * HOUR, clampedByMs: -HOUR } },
    ]);
  });

  // Last: it moves the server's clock on to 17:31.
  it("still gets the happy-hour price for a sale really made then and synced later", async () => {
    clock.advance(7.5 * HOUR);
    const result = await pushOne(app, s.tillA, teaDraftAt("2026-10-20T08:00:00.000Z"));
    expect(result.status).toBe("accepted");
    expect(priceOf(result)).toBe(TEA_M / 2);
  });
});
