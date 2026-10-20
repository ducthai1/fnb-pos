import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { failedBill, printLogOf, reported } from "../support/print-commands";
import { coffeeDraft, openedShift } from "../support/shift-commands";
import { pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const AT = "2026-10-20T08:15:00.000+07:00";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const feedRowsOf = (commandId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM change_log WHERE command_id = $1",
      [commandId],
    );
    return rows[0].n as number;
  });

describe("print.job_reported", () => {
  it("logs the report under the till's branch, device and staff, and syncs nothing back", async () => {
    const orderId = await coffeeDraft(app, s, s.tillA);
    const report = failedBill(orderId, AT);
    const sent = reported(s.tillA, report);
    const answer = await pushOne(app, s.tillA, sent);
    expect(answer).toMatchObject({ status: "accepted" });
    expect(answer.snapshot).toBeUndefined();
    expect(await feedRowsOf(sent.commandId)).toBe(0);
    expect(await printLogOf(pool, s.shop.tenantId, report.jobId)).toEqual([
      {
        branch_id: s.shop.branchId,
        device_id: s.tillA.deviceId,
        staff_id: s.tillA.staffId,
        kind: "bill",
        status: "failed",
        attempts: 3,
        printer_key: "counter",
        order_id: orderId,
        shift_id: null,
        error_code: "paper_out",
        occurred_at: new Date(AT),
        payload: report,
      },
    ]);
  });

  it("keeps one row when the till sends the same command again", async () => {
    const orderId = await coffeeDraft(app, s, s.tillA);
    const report = failedBill(orderId, AT);
    const sent = reported(s.tillA, report);
    const first = await pushOne(app, s.tillA, sent);
    expect(await pushOne(app, s.tillA, sent)).toEqual(first);
    expect(await printLogOf(pool, s.shop.tenantId, report.jobId)).toHaveLength(1);
  });

  it("logs a shift report under the shift it names", async () => {
    const shiftId = await openedShift(app, s.tillB, 500_000);
    const report = failedBill("", AT, { kind: "shift_report", orderId: undefined, shiftId });
    expect((await pushOne(app, s.tillB, reported(s.tillB, report))).status).toBe("accepted");
    expect(await printLogOf(pool, s.shop.tenantId, report.jobId)).toMatchObject([
      { kind: "shift_report", shift_id: shiftId, order_id: null },
    ]);
  });

  it.each([
    ["an order of another branch", "SYNC_PRINT_ORDER_NOT_FOUND", "order"],
    ["a shift of another branch", "SYNC_PRINT_SHIFT_NOT_FOUND", "shift"],
  ] as const)("refuses a report naming %s, and logs nothing", async (_label, code, names) => {
    const elsewhere = s.otherBranchTill;
    const report =
      names === "order"
        ? failedBill(await coffeeDraft(app, s, elsewhere), AT)
        : failedBill("", AT, {
            kind: "shift_report",
            orderId: undefined,
            shiftId: await openedShift(app, elsewhere, 0),
          });
    expect((await pushOne(app, s.tillA, reported(s.tillA, report))).code).toBe(code);
    expect(await printLogOf(pool, s.shop.tenantId, report.jobId)).toEqual([]);
  });

  it("refuses a failure that does not say why, before anything is logged", async () => {
    const orderId = await coffeeDraft(app, s, s.tillA);
    const report = failedBill(orderId, AT, { errorCode: undefined });
    expect((await pushOne(app, s.tillA, reported(s.tillA, report))).code).toBe(
      "SYNC_INVALID_PAYLOAD",
    );
    expect(await printLogOf(pool, s.shop.tenantId, report.jobId)).toEqual([]);
  });
});
