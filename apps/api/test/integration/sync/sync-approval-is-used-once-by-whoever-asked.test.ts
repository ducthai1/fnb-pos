import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { requestApproval } from "../support/approval-requests";
import { expectStatus } from "../support/catalog-shop";
import { startShift } from "../support/staffed-shop";
import { approve, approvedAt, hireManager, justNow, signInAs } from "../support/sync-approvals";
import { line, pushOnTime, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const TEN_MINUTES = 10 * 60_000;
/** How far a till's clock may run behind the server's. */
const TWO_MINUTES = 2 * 60_000;

let pool: pg.Pool;
let app: FastifyInstance;
const clock = tillsClock();
let s: SyncShop;
let managerId: string;
let cashierOnB: { staffId: string; staffToken: string };
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  cashierOnB = { staffId: s.tillB.staffId, staffToken: s.tillB.staffToken };
  await signInAs(app, s, s.tillB, "waiter");
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${cake}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        kind: "retail_item",
        name: "Bánh nhà làm",
        pricingMode: "open_price",
        basePrice: null,
        taxRateBp: 800,
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A waiter's draft typing a price, relying on `approvalId`. */
function typedPrice(approvalId: string, createdAt = justNow(), till: Till = s.tillB) {
  const sent = saveDraft(till, [line(cake, { enteredPrice: 42_000 })]);
  return { ...sent, createdAt, payload: { ...(sent.payload as object), approvalId } };
}

const openPrice = { key: "open_price" };

describe("an on-the-spot approval relied on by a command", () => {
  it("is good for one command only", async () => {
    const approvalId = await approve(app, s.tillB, managerId, openPrice);
    expect((await pushOne(app, s.tillB, typedPrice(approvalId))).status).toBe("accepted");
    const again = await pushOne(app, s.tillB, typedPrice(approvalId));
    expect(again).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_ALREADY_USED" });
  });

  it("is given back when the command relying on it is refused for another reason", async () => {
    const approvalId = await approve(app, s.tillB, managerId, openPrice);
    const first = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, s.tillB, first)).status).toBe("accepted");
    const number = (first.payload as { deviceOrderNo: number }).deviceOrderNo;
    const taken = typedPrice(approvalId);
    const clash = { ...taken, payload: { ...(taken.payload as object), deviceOrderNo: number } };
    expect((await pushOne(app, s.tillB, clash)).code).toBe("SYNC_DEVICE_ORDER_NO_TAKEN");
    expect((await pushOne(app, s.tillB, typedPrice(approvalId))).status).toBe("accepted");
  });

  it("does not cover another action", async () => {
    const approvalId = await approve(app, s.tillB, managerId, { key: "refund" });
    const result = await pushOne(app, s.tillB, typedPrice(approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_FOR_ANOTHER_ACTION" });
  });

  it("belongs to the staff member who asked for it", async () => {
    const asked = await requestApproval(app, s.tillB.deviceToken, cashierOnB.staffToken, {
      action: openPrice,
      approverStaffId: managerId,
      approverPin: "4826",
    });
    const result = await pushOne(app, s.tillB, typedPrice(asked.body.approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOR_THIS_STAFF" });
  });

  it("belongs to the till it was asked on", async () => {
    // The same waiter signs in on till A too and asks there.
    const shift = await startShift(app, s.tillA.deviceToken, s.tillB.staffId, "4826");
    const onTillA = {
      ...s.tillA,
      staffId: s.tillB.staffId,
      staffToken: shift.body.staffSessionToken,
    };
    const approvalId = await approve(app, onTillA, managerId, openPrice);
    const result = await pushOne(app, s.tillB, typedPrice(approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOR_THIS_STAFF" });
  });

  it("must exist in the till's own shop", async () => {
    const result = await pushOne(app, s.tillB, typedPrice(newId()));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOUND" });
  });

  it("covers a command the till recorded up to ten minutes after it, or two before", async () => {
    const at = async () => {
      const approvalId = await approve(app, s.tillB, managerId, openPrice);
      return { approvalId, when: await approvedAt(pool, s.shop.tenantId, approvalId) };
    };
    const outcomes = [];
    for (const offset of [TEN_MINUTES, TEN_MINUTES + 1, -TWO_MINUTES, -TWO_MINUTES - 1]) {
      const { approvalId, when } = await at();
      const sent = typedPrice(approvalId, new Date(when + offset).toISOString());
      outcomes.push((await pushOnTime(app, s.tillB, clock, sent)).code ?? "accepted");
    }
    expect(outcomes).toEqual([
      "accepted",
      "SYNC_APPROVAL_EXPIRED",
      "accepted",
      "SYNC_APPROVAL_EXPIRED",
    ]);
  });
});
