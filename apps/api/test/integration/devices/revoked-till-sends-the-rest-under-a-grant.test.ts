import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import type { ManualClock } from "../support/manual-clock";
import { freshTill, openedShift, payInShift, rowsOf } from "../support/shift-commands";
import { line, orderIdOf, push, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const COFFEE = 29_000;
const OLD_BUILD = 3;

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = tillsClock();
  app = buildApp({ pool, clock, minimumPosBuild: OLD_BUILD + 1 });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A till with its shift open, signed in, and the id of its staff session. */
async function sellingTill(): Promise<Till & { sessionId: string; shiftId: string }> {
  const till = await freshTill(app, s);
  const sessionId = await withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM staff_session WHERE device_id = $1",
      [till.deviceId],
    );
    return rows[0]?.id ?? "";
  });
  const shiftId = await openedShift(app, till, 0);
  return { ...till, sessionId, shiftId };
}

const revoke = (deviceId: string) =>
  app.inject({
    method: "POST",
    url: `/devices/${deviceId}/revoke`,
    headers: { cookie: s.shop.managerCookie },
  });

async function grant(deviceId: string, cookie = s.shop.managerCookie) {
  const response = await app.inject({
    method: "POST",
    url: `/devices/${deviceId}/flush-grants`,
    headers: { cookie },
  });
  return { status: response.statusCode, body: response.json() };
}

async function flush(
  till: Till,
  code: string,
  commands: SyncCommandEnvelope[],
  options: { final?: boolean; build?: number } = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/sync/revoked-flush",
    headers: {
      authorization: `Device ${till.deviceToken}`,
      ...(options.build === undefined ? {} : { "x-fnb-pos-build": String(options.build) }),
    },
    payload: { code, commands, ...(options.final === undefined ? {} : { final: options.final }) },
  });
  return { status: response.statusCode, body: response.json() };
}

/** A sale of one coffee paid in cash into the till's shift, stamped with its session. */
function cashSale(till: Till & { sessionId: string; shiftId: string }) {
  const draft = saveDraft(till, [line(s.menu.coffee.id)]);
  const paid = payInShift(till, orderIdOf(draft), COFFEE, till.shiftId);
  return [draft, paid].map((sent) => ({ ...sent, staffSessionId: till.sessionId }));
}

const ordersOf = (orderId: string) =>
  rowsOf(pool, s.shop.tenantId, "SELECT status FROM sales_order WHERE id = $1", [orderId]);
const paymentsOf = (orderId: string) =>
  rowsOf(pool, s.shop.tenantId, "SELECT amount, recorded_after_shift_close FROM payment WHERE order_id = $1", [orderId]);
const auditOf = (action: string, deviceId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT actor_kind, actor_id, payload FROM audit_log WHERE action = $1 AND entity_id = $2 ORDER BY created_at",
    [action, deviceId],
  );
const INVALID = { status: 401, body: { code: "API_DEVICE_FLUSH_GRANT_INVALID" } };

describe("a revoked till sending what it still holds", () => {
  it("can send nothing without a grant, and stays refused on the usual push", async () => {
    const till = await sellingTill();
    const sale = cashSale(till);
    expect((await revoke(till.deviceId)).statusCode).toBe(204);
    expect(await flush(till, "ABCD2345", sale, { final: true })).toEqual(INVALID);
    expect(await flush(till, "", sale)).toEqual(INVALID);
    expect(await ordersOf(orderIdOf(sale[0] as SyncCommandEnvelope))).toEqual([]);
    const usual = await app.inject({
      method: "POST",
      url: "/sync/commands",
      headers: { authorization: `Device ${till.deviceToken}`, "x-staff-session": till.staffToken },
      payload: { commands: sale },
    });
    expect(usual.statusCode).toBe(401);
  });

  it("sends its cash sale through the usual checks under the cashier who made it, audited", async () => {
    const till = await sellingTill();
    const sale = cashSale(till);
    await revoke(till.deviceId);
    const issued = await grant(till.deviceId);
    expect(issued.status).toBe(201);
    expect(issued.body.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{8}$/);
    expect(Date.parse(issued.body.expiresAt) - clock.now().getTime()).toBe(10 * 60_000);

    const answer = await flush(till, issued.body.code.toLowerCase(), sale, { final: true });
    expect(answer.status).toBe(200);
    expect(answer.body.results.map((r: { status: string }) => r.status)).toEqual([
      "accepted",
      "accepted",
    ]);
    const orderId = orderIdOf(sale[0] as SyncCommandEnvelope);
    expect(await ordersOf(orderId)).toEqual([{ status: "paid" }]);
    expect(await paymentsOf(orderId)).toEqual([{ amount: String(COFFEE), recorded_after_shift_close: false }]);
    const authors = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT DISTINCT staff_id FROM applied_command WHERE device_id = $1",
      [till.deviceId],
    );
    expect(authors).toEqual([{ staff_id: till.staffId }]);
    // Still revoked: its credential opens nothing else.
    const me = await app.inject({
      method: "GET",
      url: "/devices/me",
      headers: { authorization: `Device ${till.deviceToken}` },
    });
    expect(me.statusCode).toBe(401);
    const issuedAudit = await auditOf("device.flush_grant_issued", till.deviceId);
    expect(issuedAudit).toHaveLength(1);
    expect(issuedAudit[0]).toMatchObject({ actor_kind: "app_user" });
    const batches = await auditOf("device.flushed_under_grant", till.deviceId);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      actor_kind: "device",
      actor_id: till.deviceId,
      payload: { accepted: sale.map((c) => c.commandId), rejected: [], finished: true },
    });
  });

  it("refuses a grant once spent, once expired, or on another revoked till", async () => {
    const till = await sellingTill();
    const other = await sellingTill();
    const [draft, paid] = cashSale(till) as [SyncCommandEnvelope, SyncCommandEnvelope];
    await revoke(till.deviceId);
    await revoke(other.deviceId);
    const { code } = (await grant(till.deviceId)).body;
    expect(await flush(other, code, cashSale(other), { final: true })).toEqual(INVALID);
    expect((await flush(till, code, [draft], { final: true })).status).toBe(200);
    expect(await flush(till, code, [paid], { final: true })).toEqual(INVALID);

    const late = (await grant(till.deviceId)).body.code;
    clock.advance(10 * 60_000);
    expect(await flush(till, late, [paid], { final: true })).toEqual(INVALID);
    expect(await paymentsOf(orderIdOf(draft))).toEqual([]);
  });

  it("is not issued for a till still paired, nor taken from one", async () => {
    const till = await sellingTill();
    expect(await grant(till.deviceId)).toEqual({
      status: 409,
      body: { code: "API_DEVICE_NOT_REVOKED" },
    });
    expect(await grant(newId())).toEqual({ status: 404, body: { code: "API_DEVICE_NOT_FOUND" } });
    const [draft] = cashSale(till) as [SyncCommandEnvelope];
    expect(await flush(till, "ABCD2345", [draft])).toEqual({
      status: 409,
      body: { code: "API_DEVICE_NOT_REVOKED" },
    });
    expect((await grant(till.deviceId, "")).status).toBe(401);
  });

  it("resumes under the same code after the network cut a batch off, with nothing twice", async () => {
    const till = await sellingTill();
    const first = cashSale(till);
    const second = cashSale(till);
    await revoke(till.deviceId);
    const { code } = (await grant(till.deviceId)).body;
    // The server took the first batch but the till never heard: it sends it again with the rest.
    expect((await flush(till, code, first)).status).toBe(200);
    const again = await flush(till, code, [...first, ...second], { final: true });
    expect(again.body.results.map((r: { status: string }) => r.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
    ]);
    for (const sale of [first, second]) {
      expect(await paymentsOf(orderIdOf(sale[0] as SyncCommandEnvelope))).toHaveLength(1);
    }
    // The last answer lost too: the code is spent, a new one replays the same answers.
    expect(await flush(till, code, second, { final: true })).toEqual(INVALID);
    const replay = await flush(till, (await grant(till.deviceId)).body.code, second, {
      final: true,
    });
    expect(replay.body.results).toEqual(again.body.results.slice(2));
    expect(await paymentsOf(orderIdOf(second[0] as SyncCommandEnvelope))).toHaveLength(1);
  });

  it("keeps the cash of a shift closed meanwhile, marked as after the close", async () => {
    const till = await sellingTill();
    const sale = cashSale(till);
    await revoke(till.deviceId);
    await withTenant(pool, s.shop.tenantId, (client) =>
      client.query(
        "UPDATE shift SET status = 'closed', closed_at = now(), closed_by_staff_id = $2, " +
          "counted_cash = 0, expected_cash = 0, difference = 0, open_orders_carried = 0 WHERE id = $1",
        [till.shiftId, till.staffId],
      ),
    );
    const answer = await flush(till, (await grant(till.deviceId)).body.code, sale, { final: true });
    expect(answer.body.results.map((r: { status: string }) => r.status)).toEqual([
      "accepted",
      "accepted",
    ]);
    expect(await paymentsOf(orderIdOf(sale[0] as SyncCommandEnvelope))).toEqual([
      { amount: String(COFFEE), recorded_after_shift_close: true },
    ]);
  });

  it("answers a command stale by now as refused, and stores the refusal for the till to show", async () => {
    const till = await sellingTill();
    const sent = saveDraft(till, [line(s.menu.coffee.id)]);
    const draft = {
      ...sent,
      payload: { ...(sent.payload as object), expectedVersion: 0 },
      staffSessionId: till.sessionId,
    };
    // The order already moved on at the server: another till saved it first.
    const orderId = orderIdOf(draft);
    const [elsewhere] = await push(app, s.tillA, [
      saveDraft(s.tillA, [line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM })], {
        orderId,
      }),
    ]);
    expect(elsewhere?.status).toBe("accepted");
    await revoke(till.deviceId);
    const answer = await flush(till, (await grant(till.deviceId)).body.code, [draft], {
      final: true,
    });
    expect(answer.body.results[0]).toMatchObject({ status: "rejected" });
    const stored = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT status, code FROM applied_command WHERE command_id = $1",
      [draft.commandId],
    );
    expect(stored).toEqual([{ status: "rejected", code: answer.body.results[0].code }]);
    const audit = await auditOf("device.flushed_under_grant", till.deviceId);
    expect(audit[0]?.payload.rejected).toEqual([draft.commandId]);
  });

  it("does not spend the grant on a last batch the server told to come again", async () => {
    const till = await sellingTill();
    const [draft, paid] = cashSale(till) as [SyncCommandEnvelope, SyncCommandEnvelope];
    await revoke(till.deviceId);
    const { code } = (await grant(till.deviceId)).body;
    // The payment alone: its draft (the command before it) has not come, so it must wait.
    const early = await flush(till, code, [paid], { final: true });
    expect(early.body.results[0]).toMatchObject({ status: "retry" });
    const whole = await flush(till, code, [draft, paid], { final: true });
    expect(whole.body.results.map((r: { status: string }) => r.status)).toEqual([
      "accepted",
      "accepted",
    ]);
  });

  it("serves no till below the minimum build, as the usual sync does", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const { code } = (await grant(till.deviceId)).body;
    const [draft] = cashSale(till) as [SyncCommandEnvelope];
    const old = await flush(till, code, [draft], { build: OLD_BUILD });
    expect(old).toEqual({ status: 426, body: { code: "API_POS_RELEASE_TOO_OLD" } });
    expect((await flush(till, code, [draft], { build: OLD_BUILD + 1, final: true })).status).toBe(
      200,
    );
  });

  it("refuses a token nobody issued and a malformed body", async () => {
    const till = await sellingTill();
    const [draft] = cashSale(till) as [SyncCommandEnvelope];
    const nobody = { ...till, deviceToken: `${s.shop.tenantId}.${"A".repeat(43)}` };
    expect(await flush(nobody, "ABCD2345", [draft])).toEqual({
      status: 401,
      body: { code: "API_DEVICE_UNAUTHENTICATED" },
    });
    const empty = await app.inject({
      method: "POST",
      url: "/sync/revoked-flush",
      headers: { authorization: `Device ${till.deviceToken}` },
      payload: { code: "ABCD2345", commands: [] },
    });
    expect(empty.statusCode).toBe(400);
  });
});
