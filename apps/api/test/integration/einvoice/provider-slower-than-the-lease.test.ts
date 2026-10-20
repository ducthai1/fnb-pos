import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { claimDueInvoice } from "../../../src/einvoice/einvoice-claims";
import {
  DEFAULT_EINVOICE_RETRY_POLICY as POLICY,
  providerCallTimeoutMs,
} from "../../../src/einvoice/einvoice-retry-policy";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { rowsOf } from "../support/shift-commands";
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

const TIMEOUT = providerCallTimeoutMs(POLICY);

const callsFor = (id: string, operation: "issue" | "lookup") =>
  api.provider
    .callsOf(operation)
    .filter((call) =>
      call.operation === "issue" ? call.document.id === id : call.documentId === id,
    );

const stateOf = async (s: SyncShop) => {
  const [row] = await invoicesOf(pool, s.shop.tenantId);
  if (row === undefined) throw new Error("no invoice");
  return { id: row.id, status: row.status, attempts: row.attempts, number: row.number };
};

const lateAnswersOf = (s: SyncShop) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT entity_id, payload FROM audit_log WHERE action = 'einvoice.issued_after_lease'",
  );

describe("an invoice provider slower than the worker's lease", () => {
  it("is given up before the lease ends, so the row is tried again rather than taken twice", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const { id } = await stateOf(s);
    const release = api.provider.holdNext("issue");
    try {
      const round = api.workFor(s.shop.tenantId);
      await vi.waitFor(() => expect(callsFor(id, "issue")).toHaveLength(1));
      const [call] = callsFor(id, "issue");
      api.clock.advance(TIMEOUT - 1);
      expect(call?.signal?.aborted).toBe(false);
      api.clock.advance(1);
      expect(call?.signal?.aborted).toBe(true);
      expect(await round).toMatchObject({ retrying: 1, stale: 0 });
    } finally {
      release();
    }
    const [row] = await invoicesOf(pool, s.shop.tenantId);
    expect(row).toMatchObject({
      status: "failed_retryable",
      attempts: 1,
      last_error_code: "EINVOICE_PROVIDER_TIMEOUT",
    });
    // Recorded while the lease still held: the next try waits for the retry delay.
    expect(row?.next_attempt_at).toEqual(new Date(api.clock.now().getTime() + 30_000));
  });

  it("keeps an issued answer that came back after the lease, the row following the later attempt", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const { id } = await stateOf(s);
    const releaseFirst = api.provider.holdNext("issue", { ignoresAbort: true });
    const first = api.workFor(s.shop.tenantId);
    await vi.waitFor(() => expect(callsFor(id, "issue")).toHaveLength(1));
    api.clock.advance(POLICY.leaseMs);
    const releaseSecond = api.provider.holdNext("issue");
    const second = api.workFor(s.shop.tenantId);
    await vi.waitFor(() => expect(callsFor(id, "issue")).toHaveLength(2));
    // The second attempt asked first; the provider had not issued anything yet.
    expect(callsFor(id, "lookup")).toHaveLength(1);
    releaseFirst();
    expect(await first).toMatchObject({ issued: 0, stale: 1 });
    expect(await stateOf(s)).toMatchObject({ status: "pending", attempts: 2, number: null });
    const [late] = await lateAnswersOf(s);
    expect(late).toMatchObject({ entity_id: id, payload: { attempt: 1, rowAttempts: 2 } });
    expect(late?.payload.number).toMatch(/^\d{8}$/);
    api.provider.failNext("issue", { failure: "temporary", code: "PROVIDER_STILL_BUSY" });
    releaseSecond();
    expect(await second).toMatchObject({ retrying: 1 });
    expect(await stateOf(s)).toMatchObject({ status: "failed_retryable", attempts: 2 });
    // The third attempt finds the invoice the first one got and sends nothing again.
    api.clock.advance(60_000);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 1 });
    expect(await stateOf(s)).toMatchObject({ status: "issued", number: late?.payload.number });
    expect(callsFor(id, "issue")).toHaveLength(2);
  });

  it("records an invoice the provider issued for an answer that was lost, without sending it again", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const providers = [api.provider.key];
    const dead = await withTenant(pool, s.shop.tenantId, (client) =>
      claimDueInvoice(client, { now: api.clock.now(), leaseMs: POLICY.leaseMs, providers }),
    );
    if (dead === null) throw new Error("nothing claimed");
    const reached = await api.provider.issue(dead.document);
    if (!reached.ok) throw new Error(reached.code);
    api.clock.advance(POLICY.leaseMs);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 1 });
    expect(await stateOf(s)).toMatchObject({ status: "issued", number: reached.number });
    expect(callsFor(dead.id, "issue")).toHaveLength(1);
    expect(callsFor(dead.id, "lookup")).toHaveLength(1);
  });

  it("sends a first attempt without asking, and an invoice the provider does not hold again", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const { id } = await stateOf(s);
    api.provider.failNext("issue", { failure: "temporary", code: "PROVIDER_BUSY" });
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ retrying: 1 });
    expect(callsFor(id, "lookup")).toHaveLength(0);
    api.clock.advance(30_000);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 1 });
    expect(callsFor(id, "lookup")).toHaveLength(1);
    expect(callsFor(id, "issue")).toHaveLength(2);
  });

  it("does not send an invoice again while the provider cannot say whether it holds it", async () => {
    const s = await invoicingShop(api, pool);
    await paidCoffee(api.app, s);
    const { id } = await stateOf(s);
    api.provider.failNext("issue", { failure: "temporary", code: "PROVIDER_BUSY" });
    await api.workFor(s.shop.tenantId);
    api.clock.advance(30_000);
    api.provider.failNext("lookup", { failure: "temporary", code: "LOOKUP_BUSY" });
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ retrying: 1 });
    expect(callsFor(id, "issue")).toHaveLength(1);
    expect(await invoicesOf(pool, s.shop.tenantId)).toMatchObject([
      { status: "failed_retryable", attempts: 2, last_error_code: "LOOKUP_BUSY" },
    ]);
  });
});
