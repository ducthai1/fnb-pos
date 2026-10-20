import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { claimDueInvoice } from "../../../src/einvoice/einvoice-claims";
import { DEFAULT_EINVOICE_RETRY_POLICY } from "../../../src/einvoice/einvoice-retry-policy";
import { type InvoicingApi, invoicesOf, invoicingApi, invoicingShop, paidCoffee } from "../support/einvoice-shop";
import type { SyncShop } from "../support/sync-shop";

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

const callsFor = (ids: string[]) =>
  api.provider.callsOf("issue").filter((call) => ids.includes(call.document.id)).length;

const statesOf = async (s: SyncShop) =>
  (await invoicesOf(pool, s.shop.tenantId)).map((row) => ({
    status: row.status,
    attempts: row.attempts,
    code: row.last_error_code,
  }));

describe("while the invoice provider is down", () => {
  it("still takes payments, keeps their invoices queued and sends them once it is back", async () => {
    const s = await invoicingShop(api, pool);
    api.provider.goDown({ code: "PROVIDER_MAINTENANCE" });
    try {
      await paidCoffee(api.app, s);
      await paidCoffee(api.app, s);
      expect(await api.work()).toMatchObject({ retrying: 2 });
    } finally {
      api.provider.comeBack();
    }
    const failed = { status: "failed_retryable", attempts: 1, code: "PROVIDER_MAINTENANCE" };
    expect(await statesOf(s)).toEqual([failed, failed]);
    const ids = (await invoicesOf(pool, s.shop.tenantId)).map((row) => row.id);
    // Not due yet: nothing is sent before the first wait is over.
    api.clock.advance(DEFAULT_EINVOICE_RETRY_POLICY.firstDelayMs - 1);
    await api.work();
    expect(callsFor(ids)).toBe(2);
    api.clock.advance(1);
    expect(await api.work()).toMatchObject({ issued: 2 });
    const issued = await invoicesOf(pool, s.shop.tenantId);
    expect(issued.map((row) => row.status)).toEqual(["issued", "issued"]);
    expect(new Set(issued.map((row) => row.number)).size).toBe(2);
  });

  it("waits twice as long after each failure", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const gaps: number[] = [];
    api.provider.goDown();
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await api.workFor(s.shop.tenantId);
        const [row] = await invoicesOf(pool, s.shop.tenantId);
        const due = row?.next_attempt_at?.getTime() ?? 0;
        gaps.push(due - api.clock.now().getTime());
        api.clock.advance(due - api.clock.now().getTime());
      }
    } finally {
      api.provider.comeBack();
    }
    expect(gaps).toEqual([30_000, 60_000, 120_000]);
  });

  it("counts a dropped connection as a failure to try again", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    api.provider.goDown({ throws: true });
    try {
      expect(await api.workFor(s.shop.tenantId)).toMatchObject({ retrying: 1 });
    } finally {
      api.provider.comeBack();
    }
    expect(await statesOf(s)).toEqual([
      { status: "failed_retryable", attempts: 1, code: "EINVOICE_PROVIDER_UNREACHABLE" },
    ]);
  });

  it("gets an invoice back from a worker that died mid-call once its lease runs out", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const providers = [api.provider.key];
    const lease = DEFAULT_EINVOICE_RETRY_POLICY.leaseMs;
    const dead = await withTenant(pool, s.shop.tenantId, (client) =>
      claimDueInvoice(client, { now: api.clock.now(), leaseMs: lease, providers }),
    );
    expect(dead).not.toBeNull();
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 0 });
    api.clock.advance(lease);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 1 });
    expect(await statesOf(s)).toEqual([{ status: "issued", attempts: 2, code: null }]);
  });

  it("leaves invoices of a provider this worker has no adapter for to a worker that has one", async () => {
    const s = await invoicingShop(api, pool, { provider: "another_provider" });
    await paidCoffee(api.app, s);
    await api.work();
    await api.workFor(s.shop.tenantId);
    expect(await statesOf(s)).toEqual([{ status: "pending", attempts: 0, code: null }]);
  });
});
