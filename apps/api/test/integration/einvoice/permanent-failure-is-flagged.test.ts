import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type InvoicingApi, invoicesOf, invoicingApi, invoicingShop, paidCoffee } from "../support/einvoice-shop";
import { latestOrders, pullAll } from "../support/sync-commands";
import type { SyncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let api: InvoicingApi;

// A short retry limit, so running out of attempts takes three rounds.
const POLICY = { maxAttempts: 3, firstDelayMs: 1_000, maxDelayMs: 1_000, leaseMs: 60_000 };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  api = invoicingApi(pool, POLICY);
});

afterAll(async () => {
  await api.app.close();
  await pool.end();
});

const flagsOf = (s: SyncShop) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT actor_kind, entity_id, payload FROM audit_log WHERE action = 'einvoice.failed_permanent'",
    );
    return rows;
  });

describe("an invoice the provider refuses for good", () => {
  it("is failed permanently, flagged on the audit trail and shown to the tills", async () => {
    const s = await invoicingShop(api, pool);
    const { cursor } = await pullAll(api.app, s.tillA);
    const orderId = await paidCoffee(api.app, s);
    api.provider.failNext("issue", { failure: "permanent", code: "BUYER_TAX_CODE_UNKNOWN" });
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ failed: 1 });
    const [row] = await invoicesOf(pool, s.shop.tenantId);
    expect(row).toMatchObject({
      status: "failed_permanent",
      last_error_code: "BUYER_TAX_CODE_UNKNOWN",
      next_attempt_at: null,
    });
    expect(await flagsOf(s)).toEqual([
      {
        actor_kind: "system",
        entity_id: row?.id,
        payload: { orderId, code: "BUYER_TAX_CODE_UNKNOWN", lastProviderCode: "BUYER_TAX_CODE_UNKNOWN", attempts: 1 },
      },
    ]);
    const shown = latestOrders((await pullAll(api.app, s.tillA, cursor)).changes).get(orderId);
    expect(shown?.einvoice).toMatchObject({ status: "failed_permanent", number: null });
  });

  it("is never sent again by later rounds", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    api.provider.failNext("issue", { failure: "permanent", code: "SELLER_NOT_REGISTERED" });
    await api.workFor(s.shop.tenantId);
    const [row] = await invoicesOf(pool, s.shop.tenantId);
    api.clock.advance(24 * 3_600_000);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 0, failed: 0 });
    const calls = api.provider.callsOf("issue").filter((call) => call.document.id === row?.id);
    expect(calls).toHaveLength(1);
  });
});

describe("an invoice the provider keeps refusing for now", () => {
  it("is retried without a flag below the limit, then failed and flagged when it runs out", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    api.provider.failNext("issue", { failure: "temporary", code: "RATE_LIMITED" }, 3);
    for (let round = 1; round <= 2; round++) {
      expect(await api.workFor(s.shop.tenantId)).toMatchObject({ retrying: 1 });
      api.clock.advance(POLICY.maxDelayMs);
    }
    expect(await flagsOf(s)).toEqual([]);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ failed: 1 });
    const [row] = await invoicesOf(pool, s.shop.tenantId);
    expect(row).toMatchObject({
      status: "failed_permanent",
      attempts: 3,
      last_error_code: "EINVOICE_ATTEMPTS_EXHAUSTED",
    });
    expect((await flagsOf(s)).map((flag) => flag.payload.lastProviderCode)).toEqual([
      "RATE_LIMITED",
    ]);
  });
});
