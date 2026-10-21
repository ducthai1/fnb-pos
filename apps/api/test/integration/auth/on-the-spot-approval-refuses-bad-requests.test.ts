import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import { requestApproval } from "../support/approval-requests";
import { pairDevice } from "../support/paired-devices";
import { patchRole } from "../support/role-requests";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

const info = inject("testPostgres");
const ORDER = "0190a000-0000-7000-8000-00000000000a";
const LINE = "0190a000-0000-7000-8000-000000000001";
const SHIFT = "0190a000-0000-7000-8000-0000000000f1";
const DISCOUNT = {
  key: "line_discount",
  discountRate: 1_500,
  subject: { orderId: ORDER, lineId: LINE },
};

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let cashierToken: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  const cashier = await hire(app, shop, "4826", shop.roleIds.cashier);
  cashierToken = (await startShift(app, shop.deviceToken, cashier, "4826")).body.staffSessionToken;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const newManager = () => hire(app, shop, "7391", shop.roleIds.manager);
const ask = (
  approverStaffId: string,
  action: object = DISCOUNT,
  pin = "7391",
  token = cashierToken,
) => requestApproval(app, shop.deviceToken, token, { action, approverStaffId, approverPin: pin });
const refused = (status: number, code: string) => ({ status, body: { code } });
const failedAttempts = (staffId: string) =>
  withTenant(pool, shop.tenantId, async (client) => {
    const result = await client.query("SELECT pin_failed_attempts FROM staff WHERE id = $1", [
      staffId,
    ]);
    return result.rows[0].pin_failed_attempts as number;
  });

describe("an approval request", () => {
  it("naming a key outside the catalog is refused before the PIN is tried", async () => {
    const manager = await newManager();
    expect(await ask(manager, { key: "order.create" }, "0000")).toEqual(
      refused(400, "API_PERMISSION_UNKNOWN_KEY"),
    );
    expect(await failedAttempts(manager)).toBe(0);
  });

  it.each([
    ["a discount without its rate", { key: "line_discount" }],
    ["a discount above 100%", { key: "order_discount", discountRate: 10_001 }],
    ["a cash move without its amount", { key: "cash_move" }],
    ["a refund carrying an amount", { key: "refund", amount: "1000" }],
    ["a refund naming no money", { key: "refund", subject: { orderId: ORDER } }],
    [
      "a void naming no units",
      { key: "void_after_sent", subject: { orderId: ORDER, lineId: LINE } },
    ],
  ])("for %s is refused before the PIN is tried", async (_, action) => {
    const manager = await newManager();
    expect(await ask(manager, action, "0000")).toEqual(
      refused(400, "API_PERMISSION_INVALID_ACTION"),
    );
    expect(await failedAttempts(manager)).toBe(0);
  });

  // A till from before approvals were bound sends none: approved, it would cover the same
  // action on any order (a 25.000 đ refund approval spent on 2.000.000 đ of another sale).
  it.each([
    ["a refund naming no sale", { key: "refund", refundAmount: "25000" }],
    ["a cancel of a shown table naming no order", { key: "close_unpaid_table" }],
    ["a line discount naming no line", { ...DISCOUNT, subject: { orderId: ORDER } }],
    [
      "an order discount naming a line",
      { key: "order_discount", discountRate: 1_500, subject: { orderId: ORDER, lineId: LINE } },
    ],
    [
      "a cash move naming an order, not a shift",
      { key: "cash_move", amount: "900000", subject: { orderId: ORDER } },
    ],
    [
      "a close difference naming no shift",
      { key: "accept_close_difference", difference: "-20000" },
    ],
    [
      "a table transfer naming a subject it has none of",
      { key: "transfer_table", subject: { shiftId: SHIFT } },
    ],
  ])("for %s is refused before the PIN is tried", async (_, action) => {
    const manager = await newManager();
    expect(await ask(manager, action, "0000")).toEqual(
      refused(400, "API_APPROVAL_SUBJECT_REQUIRED"),
    );
    expect(await failedAttempts(manager)).toBe(0);
  });

  it("with a malformed refund amount, voided units or subject is malformed", async () => {
    const manager = await newManager();
    const subject = { orderId: ORDER };
    for (const action of [
      { key: "refund", refundAmount: "-25000", subject },
      { key: "refund", refundAmount: "25000", subject: { orderId: "12" } },
      { key: "void_after_sent", voidedQuantity: "1.2345", subject: { ...subject, lineId: LINE } },
    ]) {
      expect(await ask(manager, action)).toEqual(refused(400, "API_INVALID_REQUEST"));
    }
  });

  it("with a negative or fractional amount is malformed", async () => {
    const manager = await newManager();
    for (const amount of ["-1000", "10.5", "1e6"]) {
      expect(await ask(manager, { key: "cash_move", amount })).toEqual(
        refused(400, "API_INVALID_REQUEST"),
      );
    }
  });

  it("needs the requester's live staff session on this very till", async () => {
    const manager = await newManager();
    expect(await ask(manager, DISCOUNT, "7391", "A".repeat(43))).toEqual(
      refused(401, "API_STAFF_SESSION_INVALID"),
    );
    const sameBranch = await pairDevice(app, shop.managerCookie, shop.branchId);
    const elsewhere = await requestApproval(app, sameBranch.deviceToken, cashierToken, {
      action: DISCOUNT,
      approverStaffId: manager,
      approverPin: "7391",
    });
    expect(elsewhere).toEqual(refused(401, "API_STAFF_SESSION_INVALID"));
    expect(await failedAttempts(manager)).toBe(0);
  });

  it("needs a paired till", async () => {
    const answer = await app.inject({ method: "POST", url: "/pos/approvals", payload: {} });
    expect({ status: answer.statusCode, body: answer.json() }).toEqual(
      refused(401, "API_DEVICE_UNAUTHENTICATED"),
    );
  });

  it("with wrong PINs locks the approver out of approving and of starting a shift", async () => {
    const manager = await newManager();
    for (let i = 0; i < DEFAULT_AUTH_POLICY.pin.maxAttempts; i++) {
      expect((await ask(manager, DISCOUNT, "0000")).status).toBe(401);
    }
    expect((await ask(manager, DISCOUNT, "7391")).body.code).toBe("API_STAFF_PIN_LOCKED");
    expect((await startShift(app, shop.deviceToken, manager, "7391")).status).toBe(429);
  });

  it("judges the approver's role as it is when approving, not when they were hired", async () => {
    const manager = await newManager();
    const capped = {
      permissionKeys: ["line_discount"],
      thresholds: { line_discount: { maxRate: 1_000 } },
    };
    expect((await patchRole(app, shop.managerCookie, shop.roleIds.manager, capped)).status).toBe(
      200,
    );
    expect(await ask(manager)).toEqual(refused(403, "API_APPROVAL_APPROVER_NOT_PERMITTED"));
  });
});
