import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import {
  command,
  line,
  orderIdOf,
  pay,
  pullAll,
  pushOne,
  saveDraft,
} from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let api: InvoicingApi;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  api = invoicingApi(pool);
  s = await invoicingShop(api, pool);
});

afterAll(async () => {
  await api.app.close();
  await pool.end();
});

const COMPANY = {
  name: "Công ty CP Sáng Tạo Việt",
  taxCode: "0109876543",
  address: "1 Tràng Tiền, Hà Nội",
};

const setBuyer = (till: Till, orderId: string, buyer: unknown) =>
  pushOne(api.app, till, command(till, "order.set_buyer_info", { orderId, buyer }));

const invoiceOf = async (orderId: string) =>
  (await invoicesOf(pool, s.shop.tenantId)).find((row) => row.order_id === orderId);

const sentBuyerOf = (invoiceId: string | undefined) =>
  api.provider.callsOf("issue").find((call) => call.document.id === invoiceId)?.document.buyer;

describe("order.set_buyer_info", () => {
  it("waits on a draft and goes into the invoice the payment queues", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const orderId = orderIdOf(draft);
    await pushOne(api.app, s.tillA, draft);
    expect((await setBuyer(s.tillA, orderId, COMPANY)).status).toBe("accepted");
    await pushOne(api.app, s.tillA, pay(s.tillA, orderId, 29_000));
    expect((await invoiceOf(orderId))?.buyer).toEqual(COMPANY);
    await api.workFor(s.shop.tenantId);
    expect(sentBuyerOf((await invoiceOf(orderId))?.id)).toEqual(COMPANY);
  });

  it("takes back details given on a draft, so the invoice goes to a retail customer", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const orderId = orderIdOf(draft);
    await pushOne(api.app, s.tillA, draft);
    await setBuyer(s.tillA, orderId, COMPANY);
    expect((await setBuyer(s.tillA, orderId, null)).status).toBe("accepted");
    await pushOne(api.app, s.tillA, pay(s.tillA, orderId, 29_000));
    expect((await invoiceOf(orderId))?.buyer).toBeNull();
  });

  it("changes the queued invoice of a paid order until it was first sent", async () => {
    const orderId = await paidCoffee(api.app, s);
    const person = { name: "Nguyễn Thị Lan", phone: "0901234567" };
    expect((await setBuyer(s.tillA, orderId, person)).status).toBe("accepted");
    await api.workFor(s.shop.tenantId);
    expect(sentBuyerOf((await invoiceOf(orderId))?.id)).toEqual(person);
  });

  it("is refused once the invoice went to the provider, even by a call that failed", async () => {
    const failed = await paidCoffee(api.app, s);
    api.provider.failNext("issue", { failure: "temporary", code: "TIMEOUT" });
    await api.workFor(s.shop.tenantId);
    expect(await setBuyer(s.tillA, failed, COMPANY)).toMatchObject({
      status: "rejected",
      code: "SYNC_EINVOICE_ALREADY_SENT",
    });
    expect((await invoiceOf(failed))?.buyer).toBeNull();
    const issued = await paidCoffee(api.app, s);
    await api.workFor(s.shop.tenantId);
    expect((await setBuyer(s.tillA, issued, COMPANY)).code).toBe("SYNC_EINVOICE_ALREADY_SENT");
  });

  it("keeps the buyer off the order's snapshot, which every till of the branch keeps", async () => {
    const { cursor } = await pullAll(api.app, s.tillB);
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(api.app, s.tillA, draft);
    const answer = await setBuyer(s.tillA, orderIdOf(draft), COMPANY);
    const { changes } = await pullAll(api.app, s.tillB, cursor);
    expect(JSON.stringify([answer, changes])).not.toContain(COMPANY.taxCode);
  });

  it.each([
    ["a tax code without the company's name", { taxCode: "0109876543" }, "SYNC_INVALID_PAYLOAD"],
    ["details that name nobody", { address: "1 Tràng Tiền" }, "SYNC_INVALID_PAYLOAD"],
  ])("refuses %s", async (_case, buyer, code) => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(api.app, s.tillA, draft);
    expect((await setBuyer(s.tillA, orderIdOf(draft), buyer)).code).toBe(code);
  });

  it("is refused for an order of another branch, and on a branch that does not invoice", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(api.app, s.tillA, draft);
    const elsewhere = await setBuyer(s.otherBranchTill, orderIdOf(draft), COMPANY);
    expect(elsewhere.code).toBe("SYNC_ORDER_NOT_FOUND");
    const plain = await syncShop(api.app, pool);
    const unbilled = saveDraft(plain.tillA, [line(plain.menu.coffee.id)]);
    await pushOne(api.app, plain.tillA, unbilled);
    const answer = await setBuyer(plain.tillA, orderIdOf(unbilled), COMPANY);
    expect(answer.code).toBe("SYNC_EINVOICE_DISABLED");
    const paid = await paidCoffee(api.app, plain);
    expect((await setBuyer(plain.tillA, paid, COMPANY)).code).toBe("SYNC_EINVOICE_DISABLED");
  });
});
