import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { signedInMember } from "../support/backoffice-accounts";
import { postgresErrorCode } from "../support/postgres-error-code";
import { createRole } from "../support/roles";
import {
  cashMove,
  closeShift,
  closeTillShifts,
  freshTill,
  openedShift,
  payInShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { BUSINESS_DATE, line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, shiftOf, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const COFFEE = 29_000;

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let manager: { cookie: string; appUserId: string };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
});

// A shop of its own for each case: a branch closes a business day once.
beforeEach(async () => {
  s = await syncShop(app, pool);
  manager = await signedInMember(app, pool, s.shop.tenantId, { displayName: "Quản lý ca tối" });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

type SellingTill = Till & { sessionId: string; shiftId: string };

/** A new till of the branch with its shift open on an empty drawer, signed in. */
async function sellingTill(): Promise<SellingTill> {
  const till = await freshTill(app, s);
  const sessionId = await withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM staff_session WHERE device_id = $1",
      [till.deviceId],
    );
    return rows[0]?.id ?? "";
  });
  // Opened before the copy is made: opening numbers the till's next command.
  const shiftId = await openedShift(app, till, 0);
  return { ...till, sessionId, shiftId };
}

const asManager = (
  method: "GET" | "POST",
  url: string,
  payload?: Record<string, unknown>,
  cookie = manager.cookie,
) => app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload }) });

const revoke = (deviceId: string) => asManager("POST", `/devices/${deviceId}/revoke`);
const closeDay = () =>
  asManager("POST", `/branches/${s.shop.branchId}/day-close`, { businessDate: BUSINESS_DATE });

async function dayStatus() {
  const answer = await asManager(
    "GET",
    `/branches/${s.shop.branchId}/day-close?businessDate=${BUSINESS_DATE}`,
  );
  expect(answer.statusCode).toBe(200);
  return answer.json();
}

interface OpenShiftRow {
  id: string;
  version: number;
  expectedCash: number;
  deviceRevoked: boolean;
}

async function openShiftOf(shiftId: string): Promise<OpenShiftRow> {
  const status = await dayStatus();
  const found = (status.openShifts as OpenShiftRow[]).find((shift) => shift.id === shiftId);
  if (found === undefined) throw new Error(`shift ${shiftId} is not listed open`);
  return found;
}

async function closeOnBehalf(
  shiftId: string,
  body: Record<string, unknown>,
  cookie = manager.cookie,
) {
  const answer = await asManager("POST", `/shifts/${shiftId}/close-on-behalf`, body, cookie);
  return { status: answer.statusCode, body: answer.json() };
}

async function grant(deviceId: string): Promise<string> {
  const answer = await asManager("POST", `/devices/${deviceId}/flush-grants`);
  expect(answer.statusCode).toBe(201);
  return answer.json().code;
}

async function flush(till: Till, code: string, commands: SyncCommandEnvelope[]) {
  const answer = await app.inject({
    method: "POST",
    url: "/sync/revoked-flush",
    headers: { authorization: `Device ${till.deviceToken}` },
    payload: { code, commands, final: true },
  });
  expect(answer.statusCode).toBe(200);
  return answer.json().results as { commandId: string; status: string; code?: string }[];
}

/** A coffee rung up and paid in cash into the till's shift, as the till's outbox holds it. */
function cashSale(till: SellingTill): SyncCommandEnvelope[] {
  const draft = saveDraft(till, [line(s.menu.coffee.id)]);
  const paid = payInShift(till, orderIdOf(draft), COFFEE, till.shiftId);
  return [draft, paid].map((sent) => ({ ...sent, staffSessionId: till.sessionId }));
}

const stamped = (till: SellingTill, sent: SyncCommandEnvelope) => ({
  ...sent,
  staffSessionId: till.sessionId,
});

const shiftRow = (shiftId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT status, closed_by_staff_id, closed_by_app_user_id, counted_cash, expected_cash, " +
      "difference FROM shift WHERE id = $1",
    [shiftId],
  );

const auditOf = (shiftId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT actor_kind, actor_id, payload FROM audit_log WHERE action = 'shift.closed_on_behalf' " +
      "AND entity_id = $1",
    [shiftId],
  );

describe("a manager closing the shift of a revoked till", () => {
  it("unblocks the day: the shift is counted, audited, and the day closes", async () => {
    const till = await sellingTill();
    const [draft, paid] = cashSale(till) as [SyncCommandEnvelope, SyncCommandEnvelope];
    const d = await pushShift(app, till, draft);
    const pp = await pushShift(app, till, paid);
    expect([d.status, d.code, pp.status, pp.code]).toEqual(["accepted", undefined, "accepted", undefined]);
    expect((await revoke(till.deviceId)).statusCode).toBe(204);
    await closeTillShifts(app, pool, s);

    const refused = await closeDay();
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ code: "API_DAY_CLOSE_SHIFTS_OPEN", shiftIds: [till.shiftId] });

    const listed = await openShiftOf(till.shiftId);
    expect(listed).toMatchObject({ deviceRevoked: true, expectedCash: COFFEE });
    const closed = await closeOnBehalf(till.shiftId, { countedCash: COFFEE, version: listed.version });
    expect(closed).toMatchObject({
      status: 200,
      body: { shiftId: till.shiftId, countedCash: COFFEE, expectedCash: COFFEE, difference: 0 },
    });
    expect(await shiftRow(till.shiftId)).toEqual([
      {
        status: "closed",
        closed_by_staff_id: null,
        closed_by_app_user_id: manager.appUserId,
        counted_cash: String(COFFEE),
        expected_cash: String(COFFEE),
        difference: "0",
      },
    ]);
    const audit = await auditOf(till.shiftId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_kind: "app_user",
      actor_id: manager.appUserId,
      payload: { deviceId: till.deviceId, deviceRevoked: true, countedCash: COFFEE, expectedCash: COFFEE, difference: 0 },
    });
    expect((await closeDay()).statusCode).toBe(201);
  });

  it("is refused for a till still paired: its cashier closes it", async () => {
    const till = await sellingTill();
    const { version } = await openShiftOf(till.shiftId);
    expect(await closeOnBehalf(till.shiftId, { countedCash: 0, version })).toEqual({
      status: 409,
      body: { code: "API_SHIFT_DEVICE_NOT_REVOKED" },
    });
    expect(await shiftRow(till.shiftId)).toMatchObject([{ status: "open" }]);
    expect(await auditOf(till.shiftId)).toEqual([]);
  });

  it("lets exactly one of two managers closing at once through", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const other = await signedInMember(app, pool, s.shop.tenantId, { displayName: "Quản lý ca sáng" });
    const { version } = await openShiftOf(till.shiftId);
    const answers = await Promise.all([
      closeOnBehalf(till.shiftId, { countedCash: 10_000, version }),
      closeOnBehalf(till.shiftId, { countedCash: 20_000, version }, other.cookie),
    ]);
    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = answers.find((answer) => answer.status === 409);
    expect(["API_SHIFT_ALREADY_CLOSED", "API_SHIFT_VERSION_CONFLICT"]).toContain(loser?.body.code);
    const winner = answers.find((answer) => answer.status === 200);
    const [row] = await shiftRow(till.shiftId);
    expect(row?.counted_cash).toBe(String(winner?.body.countedCash));
    expect(await auditOf(till.shiftId)).toHaveLength(1);
    // Read again, the shift is gone from the open ones; the late manager is told it is closed.
    const again = await closeOnBehalf(till.shiftId, { countedCash: 10_000, version: version + 1 });
    expect(again).toEqual({ status: 409, body: { code: "API_SHIFT_ALREADY_CLOSED" } });
  });

  it("takes any whole amount counted, with the difference to the đồng", async () => {
    const till = await sellingTill();
    const [draft, paid] = cashSale(till) as [SyncCommandEnvelope, SyncCommandEnvelope];
    await pushShift(app, till, draft);
    await pushShift(app, till, paid);
    await revoke(till.deviceId);
    const { version } = await openShiftOf(till.shiftId);
    for (const countedCash of [-1, 1.5, "29000", 2 ** 53]) {
      expect((await closeOnBehalf(till.shiftId, { countedCash, version })).status).toBe(400);
    }
    expect((await closeOnBehalf(till.shiftId, { countedCash: 1, version, extra: 1 })).status).toBe(400);
    const odd = await closeOnBehalf(till.shiftId, { countedCash: 28_999, version });
    expect(odd.body).toMatchObject({ countedCash: 28_999, expectedCash: COFFEE, difference: -1 });
    expect(await shiftRow(till.shiftId)).toMatchObject([
      { counted_cash: "28999", expected_cash: String(COFFEE), difference: "-1" },
    ]);
  });

  it("answers a stale figure when cash reached the server after the manager read it", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const before = await openShiftOf(till.shiftId);
    expect(before.expectedCash).toBe(0);
    // The till flushes a sale while the manager is counting.
    const results = await flush(till, await grant(till.deviceId), cashSale(till));
    expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
    expect(await closeOnBehalf(till.shiftId, { countedCash: COFFEE, version: before.version })).toEqual({
      status: 409,
      body: { code: "API_SHIFT_VERSION_CONFLICT" },
    });
    const after = await openShiftOf(till.shiftId);
    expect(after.expectedCash).toBe(COFFEE);
    expect((await closeOnBehalf(till.shiftId, { countedCash: COFFEE, version: after.version })).body)
      .toMatchObject({ difference: 0 });
  });

  it("counts what the till flushed before the close in the expected cash", async () => {
    const till = await sellingTill();
    const sale = cashSale(till);
    await revoke(till.deviceId);
    await flush(till, await grant(till.deviceId), sale);
    const { version, expectedCash } = await openShiftOf(till.shiftId);
    expect(expectedCash).toBe(COFFEE);
    const closed = await closeOnBehalf(till.shiftId, { countedCash: COFFEE, version });
    expect(closed.body).toMatchObject({ expectedCash: COFFEE, difference: 0 });
    await closeTillShifts(app, pool, s);
    expect((await closeDay()).statusCode).toBe(201);
  });

  it("keeps its figures when the till flushes after it, lists that cash, and never closes twice", async () => {
    const till = await sellingTill();
    const sale = cashSale(till);
    const move = stamped(till, cashMove(till, "out", 5_000));
    const tillClose = stamped(till, closeShift(till, COFFEE - 5_000));
    await revoke(till.deviceId);
    const { version } = await openShiftOf(till.shiftId);
    // The manager finds the coffee's cash in the drawer before the till has sent the sale.
    const closed = await closeOnBehalf(till.shiftId, { countedCash: COFFEE, version });
    expect(closed.body).toMatchObject({ expectedCash: 0, difference: COFFEE });

    const code = await grant(till.deviceId);
    const results = await flush(till, code, [...sale, move, tillClose]);
    expect(results.map(({ status, code: refusal }) => [status, refusal])).toEqual([
      ["accepted", undefined],
      ["accepted", undefined],
      ["rejected", "SYNC_SHIFT_CLOSED_ON_BEHALF"],
      ["rejected", "SYNC_SHIFT_CLOSED_ON_BEHALF"],
    ]);
    const orderId = orderIdOf(sale[0] as SyncCommandEnvelope);
    expect(
      await rowsOf(pool, s.shop.tenantId, "SELECT recorded_after_shift_close AS late FROM payment WHERE order_id = $1", [orderId]),
    ).toEqual([{ late: true }]);
    expect(await shiftRow(till.shiftId)).toEqual([
      {
        status: "closed",
        closed_by_staff_id: null,
        closed_by_app_user_id: manager.appUserId,
        counted_cash: String(COFFEE),
        expected_cash: "0",
        difference: String(COFFEE),
      },
    ]);
    const status = await dayStatus();
    expect(status.closedOnBehalf).toEqual([
      expect.objectContaining({
        id: till.shiftId,
        closedByAppUserId: manager.appUserId,
        countedCash: COFFEE,
        expectedCash: 0,
        difference: COFFEE,
        cashAfterClose: COFFEE,
      }),
    ]);
    // The same batch again, as after a cut-off answer: the same answers, nothing twice.
    const again = await flush(till, await grant(till.deviceId), [...sale, move, tillClose]);
    expect(again).toEqual(results);
    expect(await auditOf(till.shiftId)).toHaveLength(1);
    await closeTillShifts(app, pool, s);
    expect((await closeDay()).statusCode).toBe(201);
  });

  it("is refused once the till's own close went through under its send-the-rest code", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const { version } = await openShiftOf(till.shiftId);
    const results = await flush(till, await grant(till.deviceId), [stamped(till, closeShift(till, 0))]);
    expect(results[0]?.status).toBe("accepted");
    expect(await closeOnBehalf(till.shiftId, { countedCash: 0, version })).toEqual({
      status: 409,
      body: { code: "API_SHIFT_ALREADY_CLOSED" },
    });
    expect(await shiftRow(till.shiftId)).toMatchObject([
      { status: "closed", closed_by_staff_id: till.staffId, closed_by_app_user_id: null },
    ]);
  });

  it("needs the keys that close the day, and sees no other shop's shift", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const { version } = await openShiftOf(till.shiftId);
    const readerRole = await createRole(pool, s.shop.tenantId, [{ key: "view_reports" }], "Xem báo cáo");
    const reader = await signedInMember(app, pool, s.shop.tenantId, { roleId: readerRole });
    expect((await closeOnBehalf(till.shiftId, { countedCash: 0, version }, reader.cookie)).status).toBe(403);
    const elsewhere = await syncShop(app, pool);
    const stranger = await signedInMember(app, pool, elsewhere.shop.tenantId);
    expect(await closeOnBehalf(till.shiftId, { countedCash: 0, version }, stranger.cookie)).toEqual({
      status: 404,
      body: { code: "API_SHIFT_NOT_FOUND" },
    });
    expect((await closeOnBehalf(newId(), { countedCash: 0, version })).status).toBe(404);
    expect(await shiftRow(till.shiftId)).toMatchObject([{ status: "open" }]);
  });

  it("lists every open shift of the day with its till, revoked or not", async () => {
    const till = await sellingTill();
    await revoke(till.deviceId);
    const status = await dayStatus();
    expect(status.openShiftIds).toEqual([shiftOf(s.tillA), shiftOf(s.tillB), till.shiftId].sort());
    const byId = new Map((status.openShifts as OpenShiftRow[]).map((shift) => [shift.id, shift]));
    expect(byId.get(till.shiftId)).toMatchObject({ deviceId: till.deviceId, deviceName: "Quầy ca", deviceRevoked: true });
    expect(byId.get(shiftOf(s.tillA))).toMatchObject({ deviceRevoked: false, expectedCash: 0 });
  });

  it("lists a till's closed shift whose cash came in after its close", async () => {
    // A handheld's sale paid into the counter's drawer reaches the server after the count.
    await closeTillShifts(app, pool, s, [s.tillA]);
    const draft = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillB, draft);
    const paid = await pushOne(app, s.tillB, payInShift(s.tillB, orderIdOf(draft), COFFEE, shiftOf(s.tillA)));
    expect(paid.status).toBe("accepted");
    const status = await dayStatus();
    expect(status.cashAfterShiftClose).toEqual([
      { id: shiftOf(s.tillA), deviceId: s.tillA.deviceId, deviceName: expect.any(String), amount: COFFEE },
    ]);
    expect(status.closedOnBehalf).toEqual([]);
  });
});

describe("the till list before a revoke", () => {
  it("says which till still has a shift open, until it is closed on its behalf", async () => {
    const till = await sellingTill();
    const listed = async () => {
      const answer = await asManager("GET", `/devices?branchId=${s.shop.branchId}`);
      const devices = answer.json().devices as { id: string; openShiftOpenedAt: string | null }[];
      return devices.find((device) => device.id === till.deviceId)?.openShiftOpenedAt;
    };
    const [opened] = await rowsOf(pool, s.shop.tenantId, "SELECT created_at FROM shift WHERE id = $1", [till.shiftId]);
    expect(await listed()).toBe((opened?.created_at as Date).toISOString());
    await revoke(till.deviceId);
    expect(await listed()).toBe((opened?.created_at as Date).toISOString());
    const { version } = await openShiftOf(till.shiftId);
    expect((await closeOnBehalf(till.shiftId, { countedCash: 0, version })).status).toBe(200);
    expect(await listed()).toBeNull();
  });
});

describe("the closed shift's record", () => {
  const close = (shiftId: string, staffId: string | null, appUserId: string | null) =>
    postgresErrorCode(() =>
      rowsOf(
        pool,
        s.shop.tenantId,
        "UPDATE shift SET status = 'closed', closed_at = now(), closed_by_staff_id = $2, " +
          "closed_by_app_user_id = $3, counted_cash = 0, expected_cash = 0, difference = 0, " +
          "open_orders_carried = 0 WHERE id = $1",
        [shiftId, staffId, appUserId],
      ),
    );
  const CHECK_VIOLATION = "23514";

  it("names exactly one closer: the cashier or the manager, never both, never neither", async () => {
    const shiftId = shiftOf(s.tillA);
    expect(await close(shiftId, s.tillA.staffId, manager.appUserId)).toBe(CHECK_VIOLATION);
    expect(await close(shiftId, null, null)).toBe(CHECK_VIOLATION);
    const naming = await postgresErrorCode(() =>
      rowsOf(pool, s.shop.tenantId, "UPDATE shift SET closed_by_app_user_id = $2 WHERE id = $1", [
        shiftId,
        manager.appUserId,
      ]),
    );
    expect(naming).toBe(CHECK_VIOLATION);
    expect(await close(shiftId, null, manager.appUserId)).toBe("no-error");
    expect(await close(shiftOf(s.tillB), s.tillB.staffId, null)).toBe("no-error");
  });
});
