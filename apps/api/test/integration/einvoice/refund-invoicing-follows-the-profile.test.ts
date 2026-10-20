import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
} from "../support/einvoice-shop";
import { signInAs } from "../support/sync-approvals";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { refund } from "../support/sync-order-commands";
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

/** Two coffees paid at till B, signed in as a manager who may refund alone; one refunded. */
async function saleAndRefund(s: SyncShop) {
  await signInAs(api.app, s, s.tillB, "manager");
  const coffee = line(s.menu.coffee.id, { quantity: "2" });
  const draft = saveDraft(s.tillB, [coffee]);
  await pushOne(api.app, s.tillB, draft);
  await pushOne(api.app, s.tillB, pay(s.tillB, orderIdOf(draft), 58_000));
  const back = [{ lineId: coffee.lineId, quantity: "1", restock: false }];
  const refunded = await pushOne(
    api.app,
    s.tillB,
    refund(s.tillB, orderIdOf(draft), back, -29_000),
  );
  expect(refunded.status).toBe("accepted");
  return { saleId: orderIdOf(draft), refundId: refunded.snapshot?.id ?? "" };
}

describe("a refund of an invoiced sale", () => {
  it("is booked without an invoice of its own unless the profile says otherwise", async () => {
    const s = await invoicingShop(api, pool);
    const { saleId } = await saleAndRefund(s);
    const rows = await invoicesOf(pool, s.shop.tenantId);
    expect(rows.map((row) => ({ order: row.order_id, kind: row.kind }))).toEqual([
      { order: saleId, kind: "sale" },
    ]);
  });

  it("gets an invoice adjusting the sale's when the profile asks, sent only after the sale's", async () => {
    const s = await invoicingShop(api, pool, { refundInvoicing: "adjustment" });
    api.provider.failNext("issue", { failure: "temporary", code: "BUSY" });
    const { saleId, refundId } = await saleAndRefund(s);
    const [sale, adjustment] = await invoicesOf(pool, s.shop.tenantId);
    expect(sale).toMatchObject({ order_id: saleId, kind: "sale" });
    expect(adjustment).toMatchObject({
      order_id: refundId,
      kind: "adjustment",
      adjusts_einvoice_id: sale?.id,
      amounts: { amountDue: -29_000 },
    });
    // The sale's invoice fails once; its adjustment must not go out ahead of it.
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 0, retrying: 1 });
    api.clock.advance(60_000);
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 2 });
    const order = api.provider
      .callsOf("issue")
      .filter((call) => call.document.id === sale?.id || call.document.id === adjustment?.id)
      .map((call) => call.document.kind);
    expect(order).toEqual(["sale", "sale", "adjustment"]);
    const [issuedSale] = await invoicesOf(pool, s.shop.tenantId);
    const sent = api.provider.callsOf("issue").at(-1)?.document;
    expect(sent?.adjusts).toEqual({ number: issuedSale?.number, templateSymbol: "1C26MAA" });
  });
});
