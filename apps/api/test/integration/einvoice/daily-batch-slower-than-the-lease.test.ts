import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { DEFAULT_EINVOICE_RETRY_POLICY as POLICY } from "../../../src/einvoice/einvoice-retry-policy";
import {
  type InvoicingApi,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { rowsOf } from "../support/shift-commands";
import { BUSINESS_DATE } from "../support/sync-commands";
import type { SyncShop } from "../support/sync-shop";

const info = inject("testPostgres");
/** The worker's lease, and when the call must have been given up: 20 s before it ends. */
const LEASE_MS = 120_000;
const GIVEN_UP_AFTER_MS = 100_000;

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

const sentFor = (s: SyncShop) =>
  api.provider
    .callsOf("submitDailyBatch")
    .filter((call) => call.batch.branchId === s.shop.branchId);

const batchOf = async (s: SyncShop) => {
  const [row] = await rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT id, status, attempts, last_error_code, reference FROM einvoice_daily_batch",
  );
  return row;
};

/** A closed day whose batch the provider could not take at the close, due again now. */
async function batchDueAgain(): Promise<SyncShop> {
  const s = await invoicingShop(api, pool);
  await paidCoffee(api.app, s);
  await api.workFor(s.shop.tenantId);
  api.provider.goDown({ code: "TAX_GATEWAY_BUSY" });
  try {
    const closed = await api.app.inject({
      method: "POST",
      url: `/branches/${s.shop.branchId}/day-close`,
      headers: { cookie: s.shop.managerCookie },
      payload: { businessDate: BUSINESS_DATE },
    });
    expect(closed.statusCode).toBe(201);
  } finally {
    api.provider.comeBack();
  }
  api.clock.advance(30_000);
  return s;
}

describe("a daily batch the provider is slower to take than the worker's lease", () => {
  it("is given up before the lease ends and tried again later", async () => {
    const s = await batchDueAgain();
    const release = api.provider.holdNext("submitDailyBatch");
    try {
      const round = api.workFor(s.shop.tenantId);
      await vi.waitFor(() => expect(sentFor(s)).toHaveLength(2));
      const call = sentFor(s)[1];
      expect(POLICY.leaseMs).toBe(LEASE_MS);
      api.clock.advance(GIVEN_UP_AFTER_MS - 1);
      expect(call?.signal?.aborted).toBe(false);
      api.clock.advance(1);
      expect(call?.signal?.aborted).toBe(true);
      expect(await round).toMatchObject({ retrying: 1, stale: 0 });
    } finally {
      release();
    }
    expect(await batchOf(s)).toMatchObject({
      status: "failed_retryable",
      attempts: 2,
      last_error_code: "EINVOICE_PROVIDER_TIMEOUT",
    });
  });

  it("keeps a receipt that came back after the lease, the row following the later attempt", async () => {
    const s = await batchDueAgain();
    const releaseFirst = api.provider.holdNext("submitDailyBatch", { ignoresAbort: true });
    const first = api.workFor(s.shop.tenantId);
    await vi.waitFor(() => expect(sentFor(s)).toHaveLength(2));
    api.clock.advance(POLICY.leaseMs);
    const releaseSecond = api.provider.holdNext("submitDailyBatch");
    const second = api.workFor(s.shop.tenantId);
    await vi.waitFor(() => expect(sentFor(s)).toHaveLength(3));
    releaseFirst();
    expect(await first).toMatchObject({ submitted: 0, stale: 1 });
    const batch = await batchOf(s);
    expect(batch).toMatchObject({ status: "failed_retryable", attempts: 3, reference: null });
    const late = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT entity_id, payload FROM audit_log WHERE action = 'einvoice.batch_submitted_after_lease'",
    );
    expect(late).toMatchObject([
      {
        entity_id: batch?.id,
        payload: { attempt: 2, rowAttempts: 3, reference: expect.stringMatching(/^FAKE-BATCH-/) },
      },
    ]);
    api.provider.failNext("submitDailyBatch", { failure: "temporary", code: "STILL_BUSY" });
    releaseSecond();
    expect(await second).toMatchObject({ retrying: 1 });
    expect(await batchOf(s)).toMatchObject({
      status: "failed_retryable",
      attempts: 3,
      last_error_code: "STILL_BUSY",
    });
  });
});
