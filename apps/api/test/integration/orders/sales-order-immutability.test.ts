import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type SeededOrder, orderMovedThrough } from "../support/closed-sales-orders";
import { postgresRefusal } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const RAISE_EXCEPTION = "P0001";

let app: pg.Pool;
let owner: pg.Pool;
let a: TenantGraph;
let paid: SeededOrder;
let posted: SeededOrder;
let cancelled: SeededOrder;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  a = await seedTenantGraph(app);
  paid = await orderMovedThrough(app, a, ["paid"]);
  posted = await orderMovedThrough(app, a, ["paid", "posted"]);
  cancelled = await orderMovedThrough(app, a, ["cancelled"]);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

// One transaction per statement: a refused statement aborts the transaction it ran in.
const asA = (pool: pg.Pool, sql: string, values: readonly unknown[]) =>
  withTenant(pool, a.tenantId, (client) => client.query(sql, [...values]));
const refusalOf = (pool: pg.Pool, sql: string, values: readonly unknown[]) =>
  postgresRefusal(() => asA(pool, sql, values));

const insertLine = (orderId: string): readonly [string, unknown[]] => [
  "INSERT INTO sales_order_line (id, tenant_id, order_id, position, line_type, name_snapshot, " +
    "unit_price, quantity, tax_rate_bp, price_source) VALUES ($1, $2, $3, 1, 'item', 'x', 0, 1, 0, 'base')",
  [newId(), a.tenantId, orderId],
];

describe("a draft order", () => {
  it("lets its header, lines and payments change, and its lines be removed", async () => {
    const draft = await orderMovedThrough(app, a, []);
    const counts = [
      await asA(app, "UPDATE sales_order SET service_type = 'dine_in' WHERE id = $1", [
        draft.orderId,
      ]),
      await asA(app, "UPDATE sales_order_line SET unit_price = 1, quantity = 3 WHERE id = $1", [
        draft.lineId,
      ]),
      await asA(app, "UPDATE payment SET amount = 3 WHERE id = $1", [draft.paymentId]),
      await asA(app, ...insertLine(draft.orderId)),
      await asA(app, "DELETE FROM sales_order_line WHERE order_id = $1", [draft.orderId]),
    ].map((result) => result.rowCount);
    expect(counts).toEqual([1, 1, 1, 1, 2]);
  });
});

describe("a paid order", () => {
  it("moves to posted when nothing else on the row changes", async () => {
    const closing = await orderMovedThrough(app, a, ["paid"]);
    const result = await asA(
      app,
      "UPDATE sales_order SET status = 'posted', version = version + 1, updated_at = now() WHERE id = $1",
      [closing.orderId],
    );
    expect(result.rowCount).toBe(1);
  });

  // Statements are built lazily: the paid order only exists once beforeAll has run.
  type Statement = () => readonly [string, unknown[]];
  const REFUSED: [string, Statement][] = [
    [
      "reprice a line",
      () => ["UPDATE sales_order_line SET unit_price = 1 WHERE id = $1", [paid.lineId]],
    ],
    [
      "change a line's quantity",
      () => ["UPDATE sales_order_line SET quantity = 5 WHERE id = $1", [paid.lineId]],
    ],
    ["add a line", () => insertLine(paid.orderId)],
    ["remove a line", () => ["DELETE FROM sales_order_line WHERE id = $1", [paid.lineId]]],
    ["change a payment", () => ["UPDATE payment SET amount = 1 WHERE id = $1", [paid.paymentId]]],
    ["remove a payment", () => ["DELETE FROM payment WHERE id = $1", [paid.paymentId]]],
    [
      "change its service type",
      () => ["UPDATE sales_order SET service_type = 'dine_in' WHERE id = $1", [paid.orderId]],
    ],
    [
      "send it back to draft",
      () => ["UPDATE sales_order SET status = 'draft' WHERE id = $1", [paid.orderId]],
    ],
    [
      "cancel it",
      () => ["UPDATE sales_order SET status = 'cancelled' WHERE id = $1", [paid.orderId]],
    ],
    [
      "change its charge profile while posting it",
      () => [
        "UPDATE sales_order SET status = 'posted', charge_profile = '{}' WHERE id = $1",
        [paid.orderId],
      ],
    ],
    ["delete it", () => ["DELETE FROM sales_order WHERE id = $1", [paid.orderId]]],
  ];

  it.each(REFUSED)("refuses the app role to %s", async (_name, statement) => {
    const refusal = await refusalOf(app, ...statement());
    expect(refusal.code).toBe(RAISE_EXCEPTION);
    expect(refusal.message).toMatch(/closed sales_order|sales_order \S+ is closed/);
  });

  it("keeps its line, payment and header exactly as they were paid", async () => {
    const rows = await withTenant(app, a.tenantId, async (client) => ({
      line: (
        await client.query("SELECT unit_price, quantity FROM sales_order_line WHERE id = $1", [
          paid.lineId,
        ])
      ).rows,
      payment: (await client.query("SELECT amount FROM payment WHERE id = $1", [paid.paymentId]))
        .rows,
      order: (
        await client.query("SELECT status, service_type FROM sales_order WHERE id = $1", [
          paid.orderId,
        ])
      ).rows,
    }));
    expect(rows).toEqual({
      line: [{ unit_price: "29000", quantity: "2.000" }],
      payment: [{ amount: "58000" }],
      order: [{ status: "paid", service_type: "takeaway" }],
    });
  });

  it("binds the owner role too, which privileges alone could not stop", async () => {
    const refusal = await refusalOf(
      owner,
      "UPDATE sales_order_line SET unit_price = 1 WHERE id = $1",
      [paid.lineId],
    );
    expect(refusal.code).toBe(RAISE_EXCEPTION);
  });
});

describe("a posted or cancelled order", () => {
  it.each([
    ["posted", () => posted],
    ["cancelled", () => cancelled],
  ])("refuses any change once %s", async (_status, order) => {
    const outcomes = [
      await refusalOf(app, "UPDATE sales_order SET status = 'paid' WHERE id = $1", [
        order().orderId,
      ]),
      await refusalOf(app, "DELETE FROM sales_order WHERE id = $1", [order().orderId]),
      await refusalOf(app, "UPDATE sales_order_line SET note = 'x' WHERE id = $1", [
        order().lineId,
      ]),
      await refusalOf(app, ...insertLine(order().orderId)),
    ];
    expect(outcomes.map((outcome) => outcome.code)).toEqual(Array(4).fill(RAISE_EXCEPTION));
  });

  it("refuses moving a draft's line under a closed order", async () => {
    const draft = await orderMovedThrough(app, a, []);
    const refusal = await refusalOf(
      app,
      "UPDATE sales_order_line SET order_id = $2 WHERE id = $1",
      [draft.lineId, posted.orderId],
    );
    expect(refusal.code).toBe(RAISE_EXCEPTION);
  });
});
