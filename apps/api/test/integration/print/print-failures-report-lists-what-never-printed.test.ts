import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import {
  type PrintReport,
  failedBill,
  printFailures,
  printedLater,
  reported,
} from "../support/print-commands";
import { coffeeDraft } from "../support/shift-commands";
import { pushOne, tillsClock } from "../support/sync-commands";
import type { Till } from "../support/sync-shop";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let orderId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  orderId = await coffeeDraft(app, s, s.tillA);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** Each test reads its own day, so the failures of the others stay out of its answer. */
const day = (date: string) => ({
  branchId: s.shop.branchId,
  from: `${date}T00:00:00.000Z`,
  to: `${date}T23:59:59.999Z`,
});
const at = (date: string, time: string) => `${date}T${time}.000Z`;

async function report(...reports: PrintReport[]) {
  for (const sent of reports) await reportFrom(s.tillA, sent);
}
async function reportFrom(till: Till, sent: PrintReport) {
  expect((await pushOne(app, till, reported(till, sent))).status).toBe("accepted");
}

async function listed(window: ReturnType<typeof day>) {
  const response = await printFailures(app, s.shop.managerCookie, window);
  expect(response.statusCode).toBe(200);
  return response.json() as { failures: { jobId: string; attempts: number }[]; truncated: boolean };
}
const jobsListed = async (window: ReturnType<typeof day>) =>
  (await listed(window)).failures.map((failure) => failure.jobId);

describe("GET /reports/print-failures", () => {
  it("lists the failures nobody printed since, newest first, with the order to find", async () => {
    const date = "2026-10-01";
    const first = failedBill(orderId, at(date, "08:00:00"));
    const second = failedBill(orderId, at(date, "09:00:00"), { kind: "kitchen", attempts: 5 });
    await report(first, second);
    const answer = await listed(day(date));
    expect(answer.truncated).toBe(false);
    expect(answer.failures).toEqual([
      {
        jobId: second.jobId,
        kind: "kitchen",
        printerKey: "counter",
        attempts: 5,
        errorCode: "paper_out",
        occurredAt: second.occurredAt,
        deviceId: s.tillA.deviceId,
        staffId: s.tillA.staffId,
        orderId,
        deviceOrderNo: 1,
        callNumber: null,
        shiftId: null,
      },
      expect.objectContaining({ jobId: first.jobId, occurredAt: first.occurredAt }),
    ]);
  });

  it("leaves out a job printed after it failed, even when it printed after the window", async () => {
    const date = "2026-10-02";
    const cleared = failedBill(orderId, at(date, "08:00:00"));
    const missing = failedBill(orderId, at(date, "08:30:00"));
    await report(cleared, missing, printedLater(cleared, at("2026-10-03", "07:00:00")));
    expect(await jobsListed(day(date))).toEqual([missing.jobId]);
  });

  it("lists a job that failed again after it once printed: that reprint is missing", async () => {
    const date = "2026-10-04";
    const failed = failedBill(orderId, at(date, "10:00:00"), { attempts: 6 });
    await report(printedLater(failed, at(date, "09:00:00"), 1), failed);
    expect(await jobsListed(day(date))).toEqual([failed.jobId]);
  });

  it("lists a job failing twice once, by its last failure", async () => {
    const date = "2026-10-05";
    const failed = failedBill(orderId, at(date, "08:00:00"));
    await report(failed, { ...failed, attempts: 6, occurredAt: at(date, "08:05:00") });
    expect((await listed(day(date))).failures).toMatchObject([
      { jobId: failed.jobId, attempts: 6 },
    ]);
  });

  it("tells a retry in the same millisecond by its attempt count", async () => {
    const date = "2026-10-06";
    const retried = failedBill(orderId, at(date, "08:00:00"), { attempts: 3 });
    const earlier = failedBill(orderId, at(date, "08:00:00"), { attempts: 3 });
    await report(retried, printedLater(retried, retried.occurredAt, 4), earlier);
    await report(printedLater(earlier, earlier.occurredAt, 2));
    expect(await jobsListed(day(date))).toEqual([earlier.jobId]);
  });

  it("keeps to the branch asked for, and to failures from `from` up to before `to`", async () => {
    const date = "2026-10-07";
    const window = { ...day(date), to: at(date, "18:00:00") };
    const atFrom = failedBill(orderId, window.from);
    const atTo = failedBill(orderId, window.to);
    // The last moment before the window, which the day before leaves out as its own `to`.
    const before = failedBill(orderId, "2026-10-06T23:59:59.999Z");
    await report(atFrom, atTo, before);
    const otherOrder = await coffeeDraft(app, s, s.otherBranchTill);
    await reportFrom(s.otherBranchTill, failedBill(otherOrder, at(date, "12:00:00")));
    expect(await jobsListed(window)).toEqual([atFrom.jobId]);
  });
});

describe("who may read the print failures", () => {
  const window = () => day("2026-10-08");

  it("answers 401 without a backoffice session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/reports/print-failures",
      query: window(),
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a member whose role cannot view reports", async () => {
    const cashier = await signedInMember(app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.cashier,
    });
    const response = await printFailures(app, cashier.cookie, window());
    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for a branch the organization does not have", async () => {
    const response = await printFailures(app, s.shop.managerCookie, {
      ...window(),
      branchId: newId(),
    });
    expect([response.statusCode, response.json().code]).toEqual([404, "API_BRANCH_NOT_FOUND"]);
  });

  it.each([
    ["a moment with no offset", { from: "2026-10-08T00:00:00" }, "API_INVALID_REQUEST"],
    ["a branch that is no id", { branchId: "branch-1" }, "API_INVALID_REQUEST"],
    ["an empty window", { to: "2026-10-08T00:00:00.000Z" }, "API_REPORT_INVALID_RANGE"],
  ])("answers 400 for %s", async (_label, change, code) => {
    const response = await printFailures(app, s.shop.managerCookie, { ...window(), ...change });
    expect([response.statusCode, response.json().code]).toEqual([400, code]);
  });
});
