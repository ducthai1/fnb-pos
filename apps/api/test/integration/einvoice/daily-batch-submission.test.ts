import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { rowsOf } from "../support/shift-commands";
import { BUSINESS_DATE, line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import type { SyncShop, Till } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let api: InvoicingApi;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  api = invoicingApi(pool);
});

afterAll(async () => {
  await api.app.close();
  await pool.end();
});

const closeDay = (s: SyncShop, businessDate = BUSINESS_DATE) =>
  api.app.inject({
    method: "POST",
    url: `/branches/${s.shop.branchId}/day-close`,
    headers: { cookie: s.shop.managerCookie },
    payload: { businessDate },
  });

const dayOf = async (s: SyncShop, businessDate = BUSINESS_DATE) =>
  (
    await api.app.inject({
      method: "GET",
      url: `/branches/${s.shop.branchId}/day-close?businessDate=${businessDate}`,
      headers: { cookie: s.shop.managerCookie },
    })
  ).json();

/** A coffee rung up and paid on `businessDate`, as a till that was offline that day sends it. */
async function paidOn(s: SyncShop, till: Till, businessDate: string) {
  const draft = { ...saveDraft(till, [line(s.menu.coffee.id)]), businessDate };
  await pushOne(api.app, till, draft);
  const paid = await pushOne(api.app, till, {
    ...pay(till, orderIdOf(draft), 29_000),
    businessDate,
  });
  expect(paid.status).toBe("accepted");
  return orderIdOf(draft);
}

const batchesSentFor = (s: SyncShop) =>
  api.provider
    .callsOf("submitDailyBatch")
    .filter((call) => call.batch.branchId === s.shop.branchId);

describe("the end-of-day batch", () => {
  it("sends the day's issued invoices of the branch once, and no other day's or branch's", async () => {
    const s = await invoicingShop(api, pool);
    const today = [await paidCoffee(api.app, s), await paidCoffee(api.app, s)];
    await paidOn(s, s.tillA, "2026-10-19");
    await paidCoffee(api.app, s, s.otherBranchTill);
    await api.workFor(s.shop.tenantId);
    const closed = await closeDay(s);
    expect(closed.statusCode).toBe(201);
    const [sent, ...more] = batchesSentFor(s);
    expect(more).toEqual([]);
    const invoices = await invoicesOf(pool, s.shop.tenantId);
    const ofToday = invoices.filter((row) => today.includes(row.order_id));
    expect(sent?.batch).toMatchObject({ businessDate: BUSINESS_DATE, regimeVersion: "nd254-tt91" });
    expect(sent?.batch.invoices.map((invoice) => invoice.number).sort()).toEqual(
      ofToday.map((row) => row.number).sort(),
    );
    expect(sent?.batch.invoices.map((invoice) => invoice.amountDue)).toEqual([29_000n, 29_000n]);
    expect(closed.json()).toMatchObject({
      batches: [
        { status: "submitted", invoiceCount: 2, reference: expect.stringMatching(/^FAKE-BATCH-/) },
      ],
      unsentInvoices: [],
    });
  });

  it("is retried by the worker when the provider cannot take it at the close", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    await api.workFor(s.shop.tenantId);
    api.provider.goDown({ code: "TAX_GATEWAY_BUSY" });
    let closed;
    try {
      closed = await closeDay(s);
    } finally {
      api.provider.comeBack();
    }
    expect(closed.statusCode).toBe(201);
    expect(closed.json()).toMatchObject({
      batches: [{ status: "failed_retryable", attempts: 1, lastErrorCode: "TAX_GATEWAY_BUSY" }],
    });
    // Until the provider takes it, the day's invoices are reported as not sent.
    expect(closed.json().unsentInvoices).toHaveLength(1);
    api.clock.advance(30_000);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ submitted: 1 });
    expect(await dayOf(s)).toMatchObject({
      batches: [{ status: "submitted" }],
      unsentInvoices: [],
    });
  });

  it("is failed and flagged when the provider refuses it for good", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    await api.workFor(s.shop.tenantId);
    api.provider.failNext("submitDailyBatch", { failure: "permanent", code: "BATCH_REJECTED" });
    const closed = await closeDay(s);
    expect(closed.json()).toMatchObject({
      batches: [{ status: "failed_permanent", lastErrorCode: "BATCH_REJECTED" }],
    });
    const flags = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT payload FROM audit_log WHERE action = 'einvoice.batch_failed_permanent'",
    );
    expect(flags).toMatchObject([
      { payload: { businessDate: BUSINESS_DATE, code: "BATCH_REJECTED" } },
    ]);
  });

  it("reports an invoice of a closed day that synced after the close as not sent", async () => {
    const s = await invoicingShop(api, pool);
    expect((await closeDay(s, "2026-10-19")).statusCode).toBe(201);
    const late = await paidOn(s, s.tillB, "2026-10-19");
    await api.workFor(s.shop.tenantId);
    const day = await dayOf(s, "2026-10-19");
    expect(day.dayClose).not.toBeNull();
    expect(day.unsentInvoices).toMatchObject([{ orderId: late, status: "issued" }]);
    expect(batchesSentFor(s)).toEqual([]);
  });

  it("queues no batch for a day without invoices", async () => {
    const s = await invoicingShop(api, pool);
    expect((await closeDay(s)).json()).toMatchObject({ batches: [] });
    expect(batchesSentFor(s)).toEqual([]);
  });
});
