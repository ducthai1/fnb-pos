import { decodeRoleGrants, withTenant } from "@fnb/db";
import { authorize, basisPoints } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { approvalsOf, requestApproval } from "../support/approval-requests";
import {
  type StaffedShop,
  createStaff,
  currentStaff,
  hire,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

const info = inject("testPostgres");
const FIFTEEN_PERCENT = { key: "line_discount", discountRate: 1_500 };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let other: StaffedShop;
const staff = { cashier: "", manager: "", otherCashier: "", owner: "", managerElsewhere: "" };
let cashierToken: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
  staff.cashier = await hire(app, shop, "4826", shop.roleIds.cashier);
  staff.manager = await hire(app, shop, "7391", shop.roleIds.manager);
  staff.otherCashier = await hire(app, shop, "5172", shop.roleIds.cashier);
  staff.owner = await hire(app, shop, "3907", shop.roleIds.owner);
  const elsewhere = await createStaff(app, shop, {
    pin: "6284",
    roleId: shop.roleIds.manager,
    branchIds: [shop.otherBranchId],
  });
  staff.managerElsewhere = elsewhere.json().staffId;
  cashierToken = (await startShift(app, shop.deviceToken, staff.cashier, "4826")).body
    .staffSessionToken;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const approve = (approverStaffId: string, approverPin: string, action: object = FIFTEEN_PERCENT) =>
  requestApproval(app, shop.deviceToken, cashierToken, { action, approverStaffId, approverPin });

const failedAttempts = (staffId: string) =>
  withTenant(pool, shop.tenantId, async (client) => {
    const result = await client.query("SELECT pin_failed_attempts FROM staff WHERE id = $1", [
      staffId,
    ]);
    return result.rows[0].pin_failed_attempts as number;
  });

const refused = (status: number, code: string) => ({ status, body: { code } });

describe("a manager approving a cashier's discount at the till", () => {
  it("logs the approval when the cashier's own grants say it needs one", async () => {
    const { grants } = (await currentStaff(app, shop.deviceToken, cashierToken)).body;
    const decoded = decodeRoleGrants(grants.permissionKeys, grants.thresholds);
    const discount = { key: "line_discount" as const, discountRate: basisPoints(1_500) };
    expect(authorize(discount, decoded)).toBe("needs_approval");

    const answer = await approve(staff.manager, "7391");
    expect(answer.status).toBe(201);
    const logged = (await approvalsOf(pool, shop.tenantId)).filter(
      (row) => row.id === answer.body.approvalId,
    );
    expect(logged).toEqual([
      {
        id: answer.body.approvalId,
        action_key: "line_discount",
        requested_by_staff_id: staff.cashier,
        approved_by_staff_id: staff.manager,
        device_id: shop.deviceId,
        branch_id: shop.branchId,
        payload: { discountRate: 1_500 },
      },
    ]);
    const audit = await withTenant(pool, shop.tenantId, async (client) => {
      const result = await client.query(
        "SELECT actor_kind, actor_id, action FROM audit_log WHERE entity_id = $1",
        [answer.body.approvalId],
      );
      return result.rows;
    });
    expect(audit).toEqual([
      { actor_kind: "staff", actor_id: staff.manager, action: "approval.granted" },
    ]);
  });

  it("keeps money exact in the log when the approval is for moving cash", async () => {
    const cash = { key: "cash_move", amount: "1500000" };
    const answer = await approve(staff.manager, "7391", cash);
    expect(answer.status).toBe(201);
    const row = (await approvalsOf(pool, shop.tenantId)).find(
      (r) => r.id === answer.body.approvalId,
    );
    expect(row?.payload).toEqual({ amount: "1500000" });
  });

  it("refuses a wrong PIN, counting it toward the same lock as starting a shift", async () => {
    const before = (await approvalsOf(pool, shop.tenantId)).length;
    expect(await approve(staff.manager, "0000")).toEqual(refused(401, "API_STAFF_PIN_INVALID"));
    expect(await failedAttempts(staff.manager)).toBe(1);
    expect((await approvalsOf(pool, shop.tenantId)).length).toBe(before);
    expect((await approve(staff.manager, "7391")).status).toBe(201);
    expect(await failedAttempts(staff.manager)).toBe(0);
  });

  it("refuses an approver who may not give that discount alone either", async () => {
    // The cashier template caps line discounts at 10%, so a second cashier cannot lend 15%.
    expect(await approve(staff.otherCashier, "5172")).toEqual(
      refused(403, "API_APPROVAL_APPROVER_NOT_PERMITTED"),
    );
    const small = { key: "line_discount", discountRate: 800 };
    expect((await approve(staff.otherCashier, "5172", small)).status).toBe(201);
  });

  it("refuses the requester approving themself, before any PIN attempt is counted", async () => {
    expect(await approve(staff.cashier, "0000")).toEqual(
      refused(403, "API_APPROVAL_SELF_APPROVAL"),
    );
    expect(await failedAttempts(staff.cashier)).toBe(0);
  });

  it("refuses keys nobody lends, even when the owner would approve", async () => {
    for (const key of ["manage_staff", "view_reports"]) {
      expect({ key, answer: await approve(staff.owner, "0000", { key }) }).toEqual({
        key,
        answer: refused(403, "API_APPROVAL_NOT_APPROVABLE"),
      });
    }
    expect(await failedAttempts(staff.owner)).toBe(0);
    expect((await approve(staff.owner, "3907", { key: "refund" })).status).toBe(201);
  });

  it("refuses an approver of another branch, who is not at this till", async () => {
    expect(await approve(staff.managerElsewhere, "6284")).toEqual(
      refused(403, "API_STAFF_NOT_IN_BRANCH"),
    );
  });

  it("does not find an approver of another tenant", async () => {
    const outsider = await hire(app, other, "7391", other.roleIds.manager);
    expect(await approve(outsider, "7391")).toEqual(refused(404, "API_STAFF_NOT_FOUND"));
  });
});
