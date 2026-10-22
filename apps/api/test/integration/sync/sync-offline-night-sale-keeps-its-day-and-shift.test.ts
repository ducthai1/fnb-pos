import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { OrderSnapshot, SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { ManualClock } from "../support/manual-clock";
import { openShift, payInShift, pushShift, rowsOf } from "../support/shift-commands";
import { line, orderIdOf, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

/** 04:30 on the 21st in Vietnam: the till comes back online after a night offline. */
const SYNCED_AT = new Date("2026-10-20T21:30:00.000Z");
/** 03:00 and 03:30 on the 21st: before the branch's day starts at 04:00. */
const SHIFT_OPENED_AT = "2026-10-20T20:00:00.000Z";
const SOLD_AT = "2026-10-20T20:30:00.000Z";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock(SYNCED_AT) });
  // The till opens its own shift, at the time the night began.
  s = await syncShop(app, pool, { openShifts: false });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const at = (sent: SyncCommandEnvelope, createdAt: string) => ({ ...sent, createdAt });

describe("a sale a till made offline at 03:30 and synced an hour later", () => {
  it("counts to the night it belongs to, in the shift it was rung up in", async () => {
    const opened = await pushShift(app, s.tillA, at(openShift(s.tillA, 500_000), SHIFT_OPENED_AT));
    expect(opened.status).toBe("accepted");
    expect(opened.snapshot?.businessDate).toBe("2026-10-20");
    const shiftId = opened.snapshot?.id ?? "";

    const draft = at(saveDraft(s.tillA, [line(s.menu.coffee.id)]), SOLD_AT);
    const saved = await pushOne(app, s.tillA, draft);
    expect((saved.snapshot as OrderSnapshot).businessDate).toBe("2026-10-20");
    const paid = at(payInShift(s.tillA, orderIdOf(draft), 29_000, shiftId), SOLD_AT);
    expect((await pushOne(app, s.tillA, paid)).status).toBe("accepted");

    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT business_date::text AS day, shift_id, paid_at FROM sales_order WHERE id = $1",
        [orderIdOf(draft)],
      ),
    ).toEqual([{ day: "2026-10-20", shift_id: shiftId, paid_at: new Date(SOLD_AT) }]);
    const clamps =
      "SELECT count(*)::int AS n FROM audit_log WHERE action = 'sync.device_clock_clamped'";
    expect(await rowsOf(pool, s.shop.tenantId, clamps)).toEqual([{ n: 0 }]);
  });

  it("while a sale rung up after 04:00 starts the new day", async () => {
    const draft = at(saveDraft(s.tillA, [line(s.menu.coffee.id)]), "2026-10-20T21:29:00.000Z");
    const saved = await pushOne(app, s.tillA, draft);
    expect((saved.snapshot as OrderSnapshot).businessDate).toBe("2026-10-21");
  });

  it("is dated by the server, whatever business day the till itself put on it", async () => {
    const draft = {
      ...at(saveDraft(s.tillA, [line(s.menu.coffee.id)]), SOLD_AT),
      businessDate: "2026-10-25",
    };
    const saved = await pushOne(app, s.tillA, draft);
    expect((saved.snapshot as OrderSnapshot).businessDate).toBe("2026-10-20");
  });
});
