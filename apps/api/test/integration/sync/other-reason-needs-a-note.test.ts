import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { freshTill, openedShift, payInShift, rowsOf } from "../support/shift-commands";
import { hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { cancel, refund, voidUnits } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** The same command with what the staff member wrote about its reason. */
const noted = (sent: SyncCommandEnvelope, reasonNote: string): SyncCommandEnvelope => ({
  ...sent,
  payload: { ...(sent.payload as object), reasonNote },
});

async function coffeeDraft(till: Till = s.tillA) {
  const coffee = line(s.menu.coffee.id);
  const sent = saveDraft(till, [coffee]);
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return { orderId: orderIdOf(sent), lineId: coffee.lineId };
}

const reasonOfOrder = async (orderId: string) =>
  (
    await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT reason_code, reason_note FROM sales_order WHERE id = $1",
      [orderId],
    )
  )[0];

describe("a reason the shop's list has no word for ('other')", () => {
  it("cancels a draft only with a note of what happened, kept trimmed on the order", async () => {
    const { orderId } = await coffeeDraft();
    const bare = await pushOne(app, s.tillA, cancel(s.tillA, orderId, "other"));
    expect(bare).toMatchObject({ status: "rejected", code: "SYNC_REASON_NOTE_REQUIRED" });
    expect(bare.snapshot?.status).toBe("draft");
    for (const note of ["   ", "ắ".repeat(121)]) {
      const refused = await pushOne(app, s.tillA, noted(cancel(s.tillA, orderId, "other"), note));
      expect(refused).toMatchObject({ status: "rejected", code: "SYNC_INVALID_PAYLOAD" });
    }
    const sent = noted(cancel(s.tillA, orderId, "other"), "  Khách gọi nhầm quán  ");
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
    expect(await reasonOfOrder(orderId)).toEqual({
      reason_code: "other",
      reason_note: "Khách gọi nhầm quán",
    });
  });

  it("takes a note of up to 120 characters, and needs none for a reason of the list", async () => {
    const longest = await coffeeDraft();
    const note = "ắ".repeat(120);
    const sent = noted(cancel(s.tillA, longest.orderId, "other"), note);
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
    expect(await reasonOfOrder(longest.orderId)).toEqual({
      reason_code: "other",
      reason_note: note,
    });

    const listed = await coffeeDraft();
    expect((await pushOne(app, s.tillA, cancel(s.tillA, listed.orderId))).status).toBe("accepted");
    expect(await reasonOfOrder(listed.orderId)).toEqual({
      reason_code: "customer_left",
      reason_note: null,
    });
  });

  it("voids units only with a note, kept on the void's record", async () => {
    const { orderId, lineId } = await coffeeDraft();
    const bare = await pushOne(app, s.tillA, voidUnits(s.tillA, orderId, lineId, "1", "other"));
    expect(bare).toMatchObject({ status: "rejected", code: "SYNC_REASON_NOTE_REQUIRED" });
    const sent = noted(voidUnits(s.tillA, orderId, lineId, "1", "other"), "Ly bị đổ");
    expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT reason_code, reason_note FROM line_void_record WHERE order_id = $1",
        [orderId],
      ),
    ).toEqual([{ reason_code: "other", reason_note: "Ly bị đổ" }]);
  });

  it("refunds only with a note, kept on the refund, and pays nothing out without one", async () => {
    const managerId = await hireManager(app, s);
    const till = await freshTill(app, s, managerId);
    await openedShift(app, till, 100_000);
    const sale = await coffeeDraft(till);
    expect((await pushOne(app, till, payInShift(till, sale.orderId, 29_000))).status).toBe(
      "accepted",
    );
    const lines = [{ lineId: sale.lineId, quantity: "1", restock: false }];
    const giveBack = () => {
      const sent = refund(till, sale.orderId, lines, -29_000);
      return { ...sent, payload: { ...(sent.payload as object), reasonCode: "other" } };
    };
    const bare = await pushOne(app, till, giveBack());
    expect(bare).toMatchObject({ status: "rejected", code: "SYNC_REASON_NOTE_REQUIRED" });
    const refundsOf = () =>
      rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT reason_code, reason_note FROM sales_order WHERE refund_of_order_id = $1",
        [sale.orderId],
      );
    expect(await refundsOf()).toEqual([]);
    const sent = noted(giveBack(), "Khách dị ứng sữa, quên dặn");
    expect((await pushOne(app, till, sent)).status).toBe("accepted");
    expect(await refundsOf()).toEqual([
      { reason_code: "other", reason_note: "Khách dị ứng sữa, quên dặn" },
    ]);
  });
});
