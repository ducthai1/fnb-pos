import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { EINVOICE_PROFILE, saveEInvoiceProfile, saveSetting } from "../support/einvoice-profiles";
import {
  type InvoicingApi,
  invoicesOf,
  invoicingApi,
  invoicingShop,
  paidCoffee,
} from "../support/einvoice-shop";
import { postgresErrorCode } from "../support/postgres-error-code";
import { signInAs } from "../support/sync-approvals";
import {
  RECORDED_AT,
  latestOrders,
  line,
  orderIdOf,
  pay,
  pullAll,
  push,
  pushOne,
  saveDraft,
} from "../support/sync-commands";
import { markSent, voidUnits } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let api: InvoicingApi;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 6 });
  api = invoicingApi(pool);
  s = await invoicingShop(api, pool);
});

afterAll(async () => {
  await api.app.close();
  await pool.end();
});

const invoicesOfOrder = async (orderId: string) =>
  (await invoicesOf(pool, s.shop.tenantId)).filter((row) => row.order_id === orderId);

describe("a paid sale of a branch that invoices", () => {
  it("queues exactly one invoice with the payment, dated when the till took the money", async () => {
    const orderId = await paidCoffee(api.app, s);
    const [queued, ...more] = await invoicesOfOrder(orderId);
    expect(more).toEqual([]);
    expect(queued).toMatchObject({ kind: "sale", status: "pending", attempts: 0, number: null });
    expect(queued?.sold_at.toISOString()).toBe(RECORDED_AT);
    // 29.000đ with 8% VAT inside: 2.148đ of tax on a 26.852đ base, as the domain splits it.
    expect(queued?.amounts).toMatchObject({
      grossTotal: 29_000,
      amountDue: 29_000,
      taxBreakdown: [{ rate: 800, base: 26_852, tax: 2_148 }],
      lines: [{ name: "Cà phê sữa", quantity: "1", unitPrice: 29_000, tax: 2_148 }],
    });
    expect(await api.workFor(s.shop.tenantId)).toMatchObject({ issued: 1 });
    const [issued] = await invoicesOfOrder(orderId);
    expect(issued).toMatchObject({ status: "issued", attempts: 1, last_error_code: null });
    expect(issued?.number).toMatch(/^\d{8}$/);
    const sent = api.provider.callsOf("issue").filter((call) => call.document.id === queued?.id);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.document).toMatchObject({
      kind: "sale",
      regimeVersion: "nd254-tt91",
      seller: { taxCode: EINVOICE_PROFILE.sellerTaxCode, templateSymbol: "1C26MAA" },
      buyer: null,
      businessDate: "2026-10-20",
    });
  });

  it("is invoiced once however often the payment is sent, and a second payment is refused", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const orderId = orderIdOf(draft);
    const payment = pay(s.tillA, orderId, 29_000);
    await push(api.app, s.tillA, [draft, payment]);
    expect((await pushOne(api.app, s.tillA, payment)).status).toBe("accepted");
    expect((await pushOne(api.app, s.tillA, pay(s.tillA, orderId, 29_000))).status).toBe(
      "rejected",
    );
    expect(await invoicesOfOrder(orderId)).toHaveLength(1);
  });

  it("queues nothing when the payment is refused, the invoice being part of it", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(api.app, s.tillA, draft);
    const short = await pushOne(api.app, s.tillA, pay(s.tillA, orderIdOf(draft), 28_000));
    expect(short.status).toBe("rejected");
    expect(await invoicesOfOrder(orderIdOf(draft))).toEqual([]);
  });

  it("goes to the till in the order's snapshot, with its lookup code once issued", async () => {
    const { cursor } = await pullAll(api.app, s.tillB);
    const orderId = await paidCoffee(api.app, s);
    const queued = latestOrders((await pullAll(api.app, s.tillB, cursor)).changes).get(orderId);
    expect(queued?.einvoice).toMatchObject({ status: "pending", lookupCode: null });
    await api.workFor(s.shop.tenantId);
    const after = latestOrders((await pullAll(api.app, s.tillB, cursor)).changes).get(orderId);
    const [row] = await invoicesOfOrder(orderId);
    expect(after?.einvoice).toMatchObject({ status: "issued", lookupCode: row?.lookup_code });
    expect(after?.einvoice?.lookupUrl).toContain(row?.lookup_code ?? "?");
    expect(after?.version).toBeGreaterThan(queued?.version ?? Infinity);
  });

  it("is sent once by two workers running side by side", async () => {
    const orders: string[] = [];
    for (let i = 0; i < 4; i++) orders.push(await paidCoffee(api.app, s));
    const ids = (await invoicesOf(pool, s.shop.tenantId))
      .filter((row) => orders.includes(row.order_id))
      .map((row) => row.id);
    const sentIds = () =>
      api.provider
        .callsOf("issue")
        .map((call) => call.document.id)
        .filter((id) => ids.includes(id));
    // Both workers' first calls are held at the provider: each must have taken its own.
    const release = api.provider.hold();
    const rounds = Promise.all([api.workFor(s.shop.tenantId), api.workFor(s.shop.tenantId)]);
    try {
      await vi.waitFor(() => expect(sentIds()).toHaveLength(2));
      expect(new Set(sentIds()).size).toBe(2);
    } finally {
      release();
    }
    const done = await rounds;
    expect(done.reduce((sum, round) => sum + round.issued, 0)).toBe(4);
    expect(sentIds().sort()).toEqual([...ids].sort());
  });

  it("lists the units sold, not those voided after the bar had them", async () => {
    await signInAs(api.app, s, s.tillB, "manager");
    const scope = { scopeKind: "branch" as const, scopeId: s.shop.branchId };
    await saveSetting(pool, s.shop.tenantId, scope, "void_after_sent_needs_approval", false);
    const teas = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM, quantity: "3" });
    const draft = saveDraft(s.tillB, [teas]);
    await pushOne(api.app, s.tillB, draft);
    await markSent(pool, s.shop.tenantId, teas.lineId, "3");
    expect(
      (await pushOne(api.app, s.tillB, voidUnits(s.tillB, orderIdOf(draft), teas.lineId, "1")))
        .status,
    ).toBe("accepted");
    await pushOne(api.app, s.tillB, pay(s.tillB, orderIdOf(draft), 70_000));
    const [row] = await invoicesOfOrder(orderIdOf(draft));
    expect(row?.amounts["lines"]).toEqual([
      expect.objectContaining({ quantity: "2", unitPrice: 35_000, gross: 70_000 }),
    ]);
  });

  it("can never be rewritten or deleted once issued", async () => {
    const orderId = await paidCoffee(api.app, s);
    await api.workFor(s.shop.tenantId);
    const [row] = await invoicesOfOrder(orderId);
    const attempt = (sql: string) =>
      withTenant(pool, s.shop.tenantId, (client) =>
        postgresErrorCode(() => client.query(sql, [row?.id])),
      );
    expect(await attempt("UPDATE einvoice SET number = '99999999' WHERE id = $1")).toBe("P0001");
    expect(await attempt("DELETE FROM einvoice WHERE id = $1")).toBe("P0001");
    expect((await invoicesOfOrder(orderId))[0]?.number).toBe(row?.number);
  });
});

describe("no invoice", () => {
  it("is queued by a branch without a profile, or with its profile switched off", async () => {
    const plain = await syncShop(api.app, pool);
    await paidCoffee(api.app, plain);
    const off = await syncShop(api.app, pool);
    const disabled = { ...EINVOICE_PROFILE, provider: api.provider.key, enabled: false };
    const scope = { scopeKind: "branch" as const, scopeId: off.shop.branchId };
    await saveEInvoiceProfile(pool, off.shop.tenantId, scope, disabled);
    await paidCoffee(api.app, off);
    expect(await invoicesOf(pool, plain.shop.tenantId)).toEqual([]);
    expect(await invoicesOf(pool, off.shop.tenantId)).toEqual([]);
  });

  it("is queued by another branch of an invoicing shop that set none", async () => {
    await paidCoffee(api.app, s, s.otherBranchTill);
    const ofOtherBranch = await withTenant(pool, s.shop.tenantId, (client) =>
      client.query("SELECT 1 FROM einvoice WHERE branch_id = $1", [s.shop.otherBranchId]),
    );
    expect(ofOtherBranch.rowCount).toBe(0);
  });
});
