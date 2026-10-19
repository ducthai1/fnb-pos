import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { approve, hireManager, signInAs } from "../support/sync-approvals";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { markSent, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const inShop = <T>(work: (client: pg.PoolClient) => Promise<T>) =>
  withTenant(pool, s.shop.tenantId, work);
const voidRecordsOf = (orderId: string) =>
  inShop(async (client) => {
    const { rows } = await client.query(
      "SELECT line_id, quantity::text, from_unsent::text, from_sent::text, staff_id, " +
        "approved_by_staff_id, approval_id, reversal_line_id IS NOT NULL AS reversed " +
        "FROM line_void_record WHERE order_id = $1",
      [orderId],
    );
    return rows;
  });

/** Two coffees with an extra shot each (78.000đ), `sent` of them already at the bar. */
async function twoCoffees(sent: string, till: Till = s.tillA) {
  const shot = {
    groupId: s.menu.coffee.extrasGroup,
    optionId: s.menu.coffee.extraShot,
    quantity: 1,
  };
  const coffee = line(s.menu.coffee.id, { quantity: "2", modifiers: [shot] });
  const draft = saveDraft(till, [coffee]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  if (sent !== "0") await markSent(pool, s.shop.tenantId, coffee.lineId, sent);
  return { orderId: orderIdOf(draft), coffee };
}

describe("order.void_line", () => {
  it("takes units the kitchen never saw off the line itself, and keeps a record", async () => {
    const { orderId, coffee } = await twoCoffees("0");
    const result = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, coffee.lineId, "1"));
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.lines.map((entry) => [entry.lineType, entry.quantity])).toEqual([
      ["item", "1"],
      ["modifier", "1"],
    ]);
    expect(await voidRecordsOf(orderId)).toEqual([
      {
        line_id: coffee.lineId,
        quantity: "1.000",
        from_unsent: "1.000",
        from_sent: "0.000",
        staff_id: s.tillA.staffId,
        approved_by_staff_id: null,
        approval_id: null,
        reversed: false,
      },
    ]);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000))).status).toBe("accepted");
  });

  it("removes a line voided whole, while its record stays", async () => {
    const { orderId, coffee } = await twoCoffees("0");
    const result = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, coffee.lineId, "2"));
    expect(result.snapshot?.lines).toEqual([]);
    expect(await voidRecordsOf(orderId)).toHaveLength(1);
  });

  it("asks a cashier for an approver before cancelling what the kitchen has", async () => {
    const { orderId, coffee } = await twoCoffees("2");
    const alone = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, coffee.lineId, "1"));
    expect(alone).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_VOID_NEEDS_APPROVAL" });
    expect(await voidRecordsOf(orderId)).toEqual([]);
    const approvalId = await approve(app, s.tillA, managerId, { key: "void_after_sent" });
    const sent = withApproval(voidUnits(s.tillA, orderId, coffee.lineId, "1"), approvalId);
    const approved = await pushOne(app, s.tillA, sent);
    expect(approved.status).toBe("accepted");
    const [item, shot, cancelLine, cancelShot] = approved.snapshot?.lines ?? [];
    expect([item?.quantity, shot?.quantity, cancelLine?.quantity, cancelShot?.quantity]).toEqual([
      "2",
      "1",
      "-1",
      "1",
    ]);
    expect(cancelLine).toMatchObject({ reversesLineId: coffee.lineId, unitPrice: 29_000 });
    expect(await voidRecordsOf(orderId)).toMatchObject([
      {
        from_sent: "1.000",
        approved_by_staff_id: managerId,
        approval_id: approvalId,
        reversed: true,
      },
    ]);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000))).status).toBe("accepted");
  });

  it("lets the cashier cancel sent units alone where the branch does not ask for an approver", async () => {
    await inShop((client) =>
      client.query(
        "INSERT INTO config_value (id, tenant_id, scope_kind, scope_id, key, value) " +
          "VALUES ($1, $2, 'branch', $3, 'void_after_sent_needs_approval', 'false')",
        [newId(), s.shop.tenantId, s.shop.branchId],
      ),
    );
    const { orderId, coffee } = await twoCoffees("2");
    const result = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, coffee.lineId, "1"));
    await inShop((client) =>
      client.query("DELETE FROM config_value WHERE key = 'void_after_sent_needs_approval'"),
    );
    expect(result.status).toBe("accepted");
    expect(await voidRecordsOf(orderId)).toMatchObject([
      { from_sent: "1.000", approved_by_staff_id: null },
    ]);
  });

  it("lets a manager cancel sent units alone", async () => {
    await signInAs(app, s, s.tillB, "manager");
    const { orderId, coffee } = await twoCoffees("2", s.tillB);
    const result = await pushOne(app, s.tillB, voidUnits(s.tillB, orderId, coffee.lineId, "2"));
    expect(result.status).toBe("accepted");
    expect(await voidRecordsOf(orderId)).toMatchObject([
      { from_sent: "2.000", approved_by_staff_id: null },
    ]);
  });

  it.each([
    ["more units than the line has left", "3", "DOMAIN_ORDER_VOID_EXCEEDS_REMAINING"],
    ["a quantity of zero", "0", "DOMAIN_ORDER_NON_POSITIVE_QUANTITY"],
  ])("refuses %s", async (_case, quantity, code) => {
    const { orderId, coffee } = await twoCoffees("0");
    const result = await pushOne(
      app,
      s.tillA,
      voidUnits(s.tillA, orderId, coffee.lineId, quantity),
    );
    expect(result).toMatchObject({ status: "rejected", code });
  });

  it("refuses a paid order, and an order of another branch as if it did not exist", async () => {
    const { orderId, coffee } = await twoCoffees("0");
    await pushOne(app, s.tillA, pay(s.tillA, orderId, 78_000));
    const paid = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, coffee.lineId, "1"));
    expect(paid.code).toBe("DOMAIN_ORDER_ALREADY_PAID");
    const theirs = saveDraft(s.otherBranchTill, [line(s.menu.coffee.id)]);
    await pushOne(app, s.otherBranchTill, theirs);
    const lineId = (theirs.payload as { lines: { lineId: string }[] }).lines[0]?.lineId ?? "";
    const result = await pushOne(app, s.tillA, voidUnits(s.tillA, orderIdOf(theirs), lineId, "1"));
    expect(result).toEqual({
      commandId: result.commandId,
      status: "rejected",
      code: "SYNC_ORDER_NOT_FOUND",
    });
  });

  it("locks a partly cancelled line against draft saves that would change it", async () => {
    const { orderId, coffee } = await twoCoffees("2");
    const approvalId = await approve(app, s.tillA, managerId, { key: "void_after_sent" });
    await pushOne(
      app,
      s.tillA,
      withApproval(voidUnits(s.tillA, orderId, coffee.lineId, "1"), approvalId),
    );
    const fewer = saveDraft(s.tillA, [{ ...coffee, quantity: "1" }], { orderId });
    expect((await pushOne(app, s.tillA, fewer)).code).toBe("SYNC_LINE_LOCKED");
    const tea = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });
    const kept = await pushOne(app, s.tillA, saveDraft(s.tillA, [coffee, tea], { orderId }));
    expect(kept.status).toBe("accepted");
    expect(kept.snapshot?.lines.map((entry) => entry.quantity)).toEqual(["2", "1", "1", "-1", "1"]);
  });
});
