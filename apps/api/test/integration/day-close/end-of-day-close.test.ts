import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import {
  type InvoicingApi,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { createRole } from "../support/roles";
import { closeShift, closeTillShifts, pushShift, rowsOf } from "../support/shift-commands";
import { BUSINESS_DATE } from "../support/sync-commands";
import { type SyncShop, shiftOf, syncShop } from "../support/sync-shop";

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

const closeDay = (s: SyncShop, businessDate = BUSINESS_DATE, cookie = s.shop.managerCookie) =>
  api.app.inject({
    method: "POST",
    url: `/branches/${s.shop.branchId}/day-close`,
    headers: { cookie },
    payload: { businessDate },
  });

const dayOf = (s: SyncShop, cookie = s.shop.managerCookie, branchId = s.shop.branchId) =>
  api.app.inject({
    method: "GET",
    url: `/branches/${branchId}/day-close?businessDate=${BUSINESS_DATE}`,
    headers: { cookie },
  });

const closesOf = (s: SyncShop) =>
  rowsOf(pool, s.shop.tenantId, "SELECT business_date::text AS day, summary FROM day_close");

describe("closing a business day", () => {
  it("is refused while a cash shift of the day is open, then allowed once it is closed", async () => {
    const s = await invoicingShop(api, pool);
    await closeTillShifts(api.app, pool, s, [s.tillB]);
    const refused = await closeDay(s);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      code: "API_DAY_CLOSE_SHIFTS_OPEN",
      shiftIds: [shiftOf(s.tillA)],
    });
    expect((await pushShift(api.app, s.tillA, closeShift(s.tillA, 0))).status).toBe("accepted");
    expect((await closeDay(s)).statusCode).toBe(201);
  });

  it("is refused while invoices of the day are queued, naming them, and closes once they are out", async () => {
    const s = await invoicingShop(api, pool);
    const orderId = await paidCoffee(api.app, s);
    await closeTillShifts(api.app, pool, s);
    const refused = await closeDay(s);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      code: "API_DAY_CLOSE_INVOICES_UNISSUED",
      invoices: [{ orderId, status: "pending", attempts: 0 }],
    });
    expect(await closesOf(s)).toEqual([]);
    await api.workFor(s.shop.tenantId);
    const closed = await closeDay(s);
    expect(closed.statusCode).toBe(201);
    expect(closed.json()).toMatchObject({
      dayClose: { businessDate: BUSINESS_DATE, summary: { einvoices: { issued: 1 } } },
      unissuedInvoices: [],
      unsentInvoices: [],
      batches: [{ status: "submitted", invoiceCount: 1 }],
    });
    expect(await closesOf(s)).toHaveLength(1);
  });

  it("is refused while the provider fails an invoice of the day for now, naming it", async () => {
    const s = await invoicingShop(api, pool);
    const orderId = await paidCoffee(api.app, s);
    await closeTillShifts(api.app, pool, s);
    api.provider.failNext("issue", { failure: "temporary", code: "PROVIDER_BUSY" });
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ retrying: 1 });
    const refused = await closeDay(s);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      code: "API_DAY_CLOSE_INVOICES_UNISSUED",
      invoices: [{ orderId, status: "failed_retryable", lastErrorCode: "PROVIDER_BUSY" }],
    });
    expect(await closesOf(s)).toEqual([]);
  });

  it("happens once: a second close of the day is refused and changes nothing", async () => {
    const s = await invoicingShop(api, pool);
    await closeTillShifts(api.app, pool, s);
    expect((await closeDay(s)).statusCode).toBe(201);
    const again = await closeDay(s);
    expect([again.statusCode, again.json()]).toEqual([409, { code: "API_DAY_ALREADY_CLOSED" }]);
    expect(await closesOf(s)).toHaveLength(1);
  });

  it("is refused for a day the branch has not reached yet", async () => {
    const s = await invoicingShop(api, pool);
    const early = await closeDay(s, "2026-10-21");
    expect([early.statusCode, early.json()]).toEqual([
      409,
      { code: "API_DAY_CLOSE_DAY_NOT_STARTED", today: BUSINESS_DATE },
    ]);
    expect((await closeDay(s, "2026-10-19")).statusCode).toBe(201);
  });

  it("is not held up by another branch's open shift, nor by an invoice failed for good", async () => {
    // The other branch's till keeps the shift syncShop opened on it.
    const s = await invoicingShop(api, pool);
    const orderId = await paidCoffee(api.app, s);
    await closeTillShifts(api.app, pool, s);
    api.provider.failNext("issue", { failure: "permanent", code: "SELLER_NOT_REGISTERED" });
    await api.workFor(s.shop.tenantId);
    const closed = await closeDay(s);
    expect(closed.statusCode).toBe(201);
    // Still listed for a person: the sale has no invoice.
    expect(closed.json().failedInvoices).toMatchObject([{ orderId, status: "failed_permanent" }]);
    expect(closed.json().dayClose.summary.einvoices).toEqual({ issued: 0, failedPermanent: 1 });
  });

  it("shows where an open day stands, to someone allowed to read reports", async () => {
    const s = await invoicingShop(api, pool);
    await closeTillShifts(api.app, pool, s, [s.tillB]);
    const open = await dayOf(s);
    expect(open.statusCode).toBe(200);
    expect(open.json()).toMatchObject({ dayClose: null, openShiftIds: [shiftOf(s.tillA)] });
  });
});

describe("who may close a day", () => {
  it("is a manager: a member without accept_close_difference is refused, and reads no status without view_reports", async () => {
    const s = await invoicingShop(api, pool);
    const readerRole = await createRole(pool, s.shop.tenantId, [{ key: "view_reports" }]);
    const reader = await signedInMember(api.app, pool, s.shop.tenantId, { roleId: readerRole });
    expect((await closeDay(s, BUSINESS_DATE, reader.cookie)).statusCode).toBe(403);
    expect((await dayOf(s, reader.cookie)).statusCode).toBe(200);
    const cashier = await signedInMember(api.app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.cashier,
    });
    expect((await dayOf(s, cashier.cookie)).statusCode).toBe(403);
    expect(await closesOf(s)).toEqual([]);
    await closeTillShifts(api.app, pool, s);
    const manager = await signedInMember(api.app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.manager,
    });
    expect((await closeDay(s, BUSINESS_DATE, manager.cookie)).statusCode).toBe(201);
  });

  it("answers 404 for a branch of another organization", async () => {
    const s = await invoicingShop(api, pool);
    const other = await syncShop(api.app, pool);
    expect((await dayOf(s, s.shop.managerCookie, other.shop.branchId)).statusCode).toBe(404);
    const closed = await api.app.inject({
      method: "POST",
      url: `/branches/${other.shop.branchId}/day-close`,
      headers: { cookie: s.shop.managerCookie },
      payload: { businessDate: BUSINESS_DATE },
    });
    expect(closed.json()).toEqual({ code: "API_BRANCH_NOT_FOUND" });
  });
});
