import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { cashMove, closeShift, freshTill } from "../support/shift-commands";
import { approve, closeUnpaid, hireManager } from "../support/sync-approvals";
import {
  command,
  line,
  orderIdOf,
  pay,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { withApproval } from "../support/sync-order-commands";
import { type SyncShop, type Till, shiftOf, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const till = () => s.tillA;

const dismissal = (
  rejectedType: string,
  extra: Record<string, unknown>,
  orderId?: string,
  from: Till = till(),
) => {
  const id = newId();
  const envelope = command(from, "sync.rejection_dismissed", {
    rejectedCommandId: id,
    rejectedType,
    rejectedCode: "SYNC_ORDER_VERSION_STALE",
    ...(orderId === undefined ? {} : { orderId }),
    ...extra,
  });
  return { id, envelope };
};

const auditOf = (commandId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT actor_kind, entity_kind, entity_id, payload FROM audit_log " +
        "WHERE action = 'sync.rejection_dismissed' AND payload->>'rejectedCommandId' = $1",
      [commandId],
    );
    return rows;
  });

const WORDS = { reasonCode: "handled_by_hand", reasonNote: "Đã hoàn tiền mặt cho khách" };

describe("setting aside a command the server refused", () => {
  it("is audited with who, what and why, against the order it was about", async () => {
    const draft = saveDraft(till(), [line(s.menu.coffee.id)]);
    expect((await pushOne(app, till(), draft)).status).toBe("accepted");
    const orderId = orderIdOf(draft);
    const set = dismissal("order.save_draft", { reasonCode: "handled_by_hand" }, orderId);
    expect((await pushOne(app, till(), set.envelope)).status).toBe("accepted");
    const rows = await auditOf(set.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_kind: "staff",
      entity_kind: "sales_order",
      entity_id: orderId,
      payload: {
        rejectedType: "order.save_draft",
        rejectedCode: "SYNC_ORDER_VERSION_STALE",
        reasonCode: "handled_by_hand",
      },
    });
  });

  it("is kept against the till when the command named no order", async () => {
    const set = dismissal("shift.open", { reasonCode: "no_longer_needed" });
    expect((await pushOne(app, till(), set.envelope)).status).toBe("accepted");
    expect((await auditOf(set.id))[0]).toMatchObject({
      entity_kind: "device",
    });
  });

  it.each([
    ["order.pay", "handled_by_hand"],
    ["order.mark_sent_to_kitchen", "no_longer_needed"],
    ["order.save_draft", "other"],
  ])("needs the staff member's words for %s with reason %s", async (type, reasonCode) => {
    // A manager holds close_unpaid_table, so only the words are in question here.
    const manager = await freshTill(app, s, managerId);
    const bare = dismissal(type, { reasonCode }, undefined, manager);
    expect((await pushOne(app, manager, bare.envelope)).code).toBe("SYNC_REASON_NOTE_REQUIRED");
    expect(await auditOf(bare.id)).toHaveLength(0);
    const said = dismissal(
      type,
      { reasonCode, reasonNote: "Đã thu tiền mặt, quản lý ghi sổ tay" },
      undefined,
      manager,
    );
    expect((await pushOne(app, manager, said.envelope)).status).toBe("accepted");
    expect(await auditOf(said.id)).toHaveLength(1);
  });

  describe("a command that moved money or told the kitchen", () => {
    const types = [
      "order.pay",
      "order.refund",
      "order.mark_sent_to_kitchen",
      "payment.create_intent",
      "payment.cancel_intent",
      "payment.hand_back_excess",
    ];

    it.each(types)("%s is refused to a cashier without a manager's approval", async (type) => {
      const draft = saveDraft(till(), [line(s.menu.coffee.id)]);
      expect((await pushOne(app, till(), draft)).status).toBe("accepted");
      const set = dismissal(type, WORDS, orderIdOf(draft));
      expect(await pushOne(app, till(), set.envelope)).toMatchObject({
        status: "rejected",
        code: "SYNC_APPROVAL_REQUIRED",
      });
      expect(await auditOf(set.id)).toHaveLength(0);
    });

    it("is set aside with the approval of that order, which the audit trail names", async () => {
      const draft = saveDraft(till(), [line(s.menu.coffee.id)]);
      expect((await pushOne(app, till(), draft)).status).toBe("accepted");
      const orderId = orderIdOf(draft);
      const approvalId = await approve(app, till(), managerId, closeUnpaid(orderId));
      const set = dismissal("order.pay", WORDS, orderId);
      const approved = withApproval(set.envelope, approvalId);
      expect((await pushOne(app, till(), approved)).status).toBe("accepted");
      expect((await auditOf(set.id))[0]?.payload).toMatchObject({
        rejectedType: "order.pay",
        approvalId,
        approvedByStaffId: managerId,
      });
    });

    it("is not covered by an approval of another order", async () => {
      const first = saveDraft(till(), [line(s.menu.coffee.id)]);
      const second = saveDraft(till(), [line(s.menu.coffee.id)]);
      expect((await pushOne(app, till(), first)).status).toBe("accepted");
      expect((await pushOne(app, till(), second)).status).toBe("accepted");
      const approvalId = await approve(app, till(), managerId, closeUnpaid(orderIdOf(first)));
      const set = dismissal("order.pay", WORDS, orderIdOf(second));
      const refused = await pushOne(app, till(), withApproval(set.envelope, approvalId));
      expect(refused.status).toBe("rejected");
      expect(await auditOf(set.id)).toHaveLength(0);
    });

    it("is the staff member's alone with close_unpaid_table, with no approval spent", async () => {
      const manager = await freshTill(app, s, managerId);
      const draft = saveDraft(manager, [line(s.menu.coffee.id)]);
      expect((await pushOne(app, manager, draft)).status).toBe("accepted");
      const set = dismissal("order.pay", WORDS, orderIdOf(draft), manager);
      expect((await pushOne(app, manager, set.envelope)).status).toBe("accepted");
      expect((await auditOf(set.id))[0]?.payload).not.toHaveProperty("approvalId");
    });

    it("names no order: only someone holding close_unpaid_table may set it aside", async () => {
      const cashier = dismissal("payment.cancel_intent", WORDS);
      expect(await pushOne(app, till(), cashier.envelope)).toMatchObject({
        status: "rejected",
        code: "SYNC_APPROVAL_REQUIRED",
      });
      const manager = await freshTill(app, s, managerId);
      const set = dismissal("payment.cancel_intent", WORDS, undefined, manager);
      expect((await pushOne(app, manager, set.envelope)).status).toBe("accepted");
    });

    describe("held to the server's record of the refused command", () => {
      /** A cash payment the server refused: the till named an amount due the order does not have. */
      async function refusedPayment(from: Till = till()) {
        const draft = saveDraft(from, [line(s.menu.coffee.id)]);
        expect((await pushOne(app, from, draft)).status).toBe("accepted");
        const orderId = orderIdOf(draft);
        const payment = pay(from, orderId, 1);
        expect((await pushOne(app, from, payment)).status).toBe("rejected");
        return { orderId, commandId: payment.commandId };
      }
      const claim = (
        refused: { commandId: string },
        rejectedType: string,
        orderId: string | undefined,
        from: Till = till(),
      ) =>
        command(from, "sync.rejection_dismissed", {
          rejectedCommandId: refused.commandId,
          rejectedType,
          rejectedCode: "DOMAIN_ORDER_TOTAL_MISMATCH",
          ...(orderId === undefined ? {} : { orderId }),
          ...WORDS,
        });

      it("refuses a refused payment named as a command that needs no approval", async () => {
        const refused = await refusedPayment();
        expect(
          await pushOne(app, till(), claim(refused, "order.save_draft", refused.orderId)),
        ).toMatchObject({
          status: "rejected",
          code: "SYNC_INVALID_PAYLOAD",
        });
        expect(await auditOf(refused.commandId)).toHaveLength(0);
      });

      it("refuses an approval of another order passed off as the payment's", async () => {
        const refused = await refusedPayment();
        const other = saveDraft(till(), [line(s.menu.coffee.id)]);
        expect((await pushOne(app, till(), other)).status).toBe("accepted");
        const approvalId = await approve(app, till(), managerId, closeUnpaid(orderIdOf(other)));
        const passedOff = withApproval(claim(refused, "order.pay", orderIdOf(other)), approvalId);
        expect(await pushOne(app, till(), passedOff)).toMatchObject({
          status: "rejected",
          code: "SYNC_INVALID_PAYLOAD",
        });
        expect(await auditOf(refused.commandId)).toHaveLength(0);
      });

      it("refuses setting aside a command another till sent", async () => {
        const refused = await refusedPayment(s.tillB);
        const manager = await freshTill(app, s, managerId);
        expect(
          await pushOne(app, manager, claim(refused, "order.pay", refused.orderId, manager)),
        ).toMatchObject({
          status: "rejected",
          code: "SYNC_INVALID_PAYLOAD",
        });
      });

      it("binds the approval to the payment's own order when the till named none", async () => {
        const refused = await refusedPayment();
        const approvalId = await approve(app, till(), managerId, closeUnpaid(refused.orderId));
        const set = withApproval(claim(refused, "order.pay", undefined), approvalId);
        expect((await pushOne(app, till(), set)).status).toBe("accepted");
        expect((await auditOf(refused.commandId))[0]).toMatchObject({
          entity_kind: "sales_order",
          entity_id: refused.orderId,
        });
      });

      it("sets the payment aside with the approval of its own order", async () => {
        const refused = await refusedPayment();
        const approvalId = await approve(app, till(), managerId, closeUnpaid(refused.orderId));
        const set = withApproval(claim(refused, "order.pay", refused.orderId), approvalId);
        expect((await pushOne(app, till(), set)).status).toBe("accepted");
        expect((await auditOf(refused.commandId))[0]?.payload).toMatchObject({
          rejectedType: "order.pay",
          approvalId,
        });
      });
    });

  });

  describe("a refused cash move or shift close", () => {
    /** A close the server refused: a drawer of 1.000.000 đ counted on an empty float. */
    async function refusedClose(from: Till = till()) {
      const sent = closeShift(from, 1_000_000);
      expect(await pushOne(app, from, sent)).toMatchObject({
        status: "rejected",
        code: "SYNC_APPROVAL_REQUIRED",
      });
      return { commandId: sent.commandId, shiftId: shiftOf(from) };
    }
    /** 900.000 đ out of the drawer, past what a cashier moves alone. */
    async function refusedCashMove(from: Till = till()) {
      const sent = cashMove(from, "out", 900_000);
      expect((await pushOne(app, from, sent)).status).toBe("rejected");
      return { commandId: sent.commandId, shiftId: shiftOf(from) };
    }
    const setAside = (
      refused: { commandId: string },
      rejectedType: string,
      shiftId: string | undefined,
      from: Till = till(),
    ) =>
      command(from, "sync.rejection_dismissed", {
        rejectedCommandId: refused.commandId,
        rejectedType,
        rejectedCode: "SYNC_APPROVAL_REQUIRED",
        ...(shiftId === undefined ? {} : { shiftId }),
        ...WORDS,
      });
    const openDrawer = (shiftId: string) => ({ key: "open_drawer", subject: { shiftId } });
    const shiftStatus = async (shiftId: string) =>
      withTenant(pool, s.shop.tenantId, async (client) => {
        const { rows } = await client.query("SELECT status FROM shift WHERE id = $1", [shiftId]);
        return rows[0]?.status as string;
      });

    it("is not a cashier's alone: without a manager's approval nothing is set aside", async () => {
      const refused = await refusedClose();
      expect(await pushOne(app, till(), setAside(refused, "shift.close", refused.shiftId))).toMatchObject({
        status: "rejected",
        code: "SYNC_APPROVAL_REQUIRED",
      });
      expect(await auditOf(refused.commandId)).toHaveLength(0);
    });

    it("is set aside with the approval of that shift, audited against it, and the shift stays open", async () => {
      const refused = await refusedClose();
      const approvalId = await approve(app, till(), managerId, openDrawer(refused.shiftId));
      const set = withApproval(setAside(refused, "shift.close", refused.shiftId), approvalId);
      expect((await pushOne(app, till(), set)).status).toBe("accepted");
      expect((await auditOf(refused.commandId))[0]).toMatchObject({
        entity_kind: "shift",
        entity_id: refused.shiftId,
        payload: { rejectedType: "shift.close", approvalId, approvedByStaffId: managerId },
      });
      // The close never happened: the server's shift is open, as the till shows it once refused.
      expect(await shiftStatus(refused.shiftId)).toBe("open");
    });

    it("is not covered by an approval of another till's shift, nor bound to another till's shift", async () => {
      const refused = await refusedCashMove();
      const elsewhere = shiftOf(s.tillB);
      const approvalId = await approve(app, till(), managerId, openDrawer(elsewhere));
      const borrowed = withApproval(setAside(refused, "shift.cash_move", refused.shiftId), approvalId);
      expect((await pushOne(app, till(), borrowed)).status).toBe("rejected");
      const misnamed = withApproval(setAside(refused, "shift.cash_move", elsewhere), approvalId);
      expect(await pushOne(app, till(), misnamed)).toMatchObject({
        status: "rejected",
        code: "SYNC_INVALID_PAYLOAD",
      });
      expect(await auditOf(refused.commandId)).toHaveLength(0);
    });

    it("spends an approval once: the same approval does not set aside a second refusal", async () => {
      const first = await refusedCashMove();
      const second = await refusedCashMove();
      const approvalId = await approve(app, till(), managerId, openDrawer(first.shiftId));
      const once = withApproval(setAside(first, "shift.cash_move", first.shiftId), approvalId);
      expect((await pushOne(app, till(), once)).status).toBe("accepted");
      const again = withApproval(setAside(second, "shift.cash_move", second.shiftId), approvalId);
      expect((await pushOne(app, till(), again)).status).toBe("rejected");
    });

    it("is a manager's alone, no approval spent; naming no shift, only theirs", async () => {
      const manager = await freshTill(app, s, managerId);
      const set = dismissal("shift.close", WORDS, undefined, manager);
      expect((await pushOne(app, manager, set.envelope)).status).toBe("accepted");
      expect((await auditOf(set.id))[0]?.payload).not.toHaveProperty("approvalId");
      const cashier = dismissal("shift.cash_move", WORDS);
      expect(await pushOne(app, till(), cashier.envelope)).toMatchObject({
        status: "rejected",
        code: "SYNC_APPROVAL_REQUIRED",
      });
    });

    it("refuses a refused close passed off as a command that needs no approval", async () => {
      const refused = await refusedClose();
      expect(await pushOne(app, till(), setAside(refused, "order.save_draft", undefined))).toMatchObject({
        status: "rejected",
        code: "SYNC_INVALID_PAYLOAD",
      });
    });
  });
});
