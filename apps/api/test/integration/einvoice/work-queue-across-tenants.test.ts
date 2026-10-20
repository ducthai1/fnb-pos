import { randomBytes } from "node:crypto";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { buildApp } from "../../../src/build-app";
import { FakeEInvoiceProvider } from "../../../src/einvoice/providers/fake-einvoice-provider";
import { EINVOICE_PROFILE, saveEInvoiceProfile } from "../support/einvoice-profiles";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { postgresErrorCode } from "../support/postgres-error-code";
import { syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";

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

const dueTenants = async (lanes: string[], at: Date) =>
  (
    await pool.query<{ t: string }>("SELECT fnb_jobs.tenants_with_due_work($1, $2, 100) AS t", [
      at,
      lanes,
    ])
  ).rows.map((row) => row.t);

describe("the queue of work across tenants", () => {
  it("names a tenant with due work for the lanes asked about, and no longer once it is done", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const lane = api.provider.key;
    expect(await dueTenants([lane], api.clock.now())).toContain(s.shop.tenantId);
    expect(await dueTenants(["some_other_lane"], api.clock.now())).not.toContain(s.shop.tenantId);
    await api.workFor(s.shop.tenantId);
    expect(await dueTenants([lane], api.clock.now())).not.toContain(s.shop.tenantId);
  });

  it.each([
    ["read", "SELECT * FROM fnb_jobs.queued_work LIMIT 1"],
    ["add to", "INSERT INTO fnb_jobs.queued_work DEFAULT VALUES"],
    ["empty", "DELETE FROM fnb_jobs.queued_work WHERE true"],
  ])("cannot be %s by the app role directly", async (_action, sql) => {
    expect(await postgresErrorCode(() => pool.query(sql))).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe("the worker inside the API process", () => {
  it("issues queued invoices on its own when switched on, and stops with the app", async () => {
    const provider = new FakeEInvoiceProvider(`fake_${randomBytes(6).toString("hex")}`);
    const app = buildApp({
      pool,
      einvoiceProviders: [provider],
      einvoiceWorker: { intervalMs: 10 },
    });
    try {
      const s = await syncShop(app, pool);
      const value = { ...EINVOICE_PROFILE, provider: provider.key };
      await saveEInvoiceProfile(
        pool,
        s.shop.tenantId,
        { scopeKind: "branch", scopeId: s.shop.branchId },
        value,
      );
      await paidCoffee(app, s);
      await vi.waitFor(
        async () => expect((await invoicesOf(pool, s.shop.tenantId))[0]?.status).toBe("issued"),
        { timeout: 10_000, interval: 20 },
      );
    } finally {
      await app.close();
    }
    expect(provider.callsOf("issue")).toHaveLength(1);
  });
});
