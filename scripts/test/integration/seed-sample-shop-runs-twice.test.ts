import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "@fnb/api/build-app";
import { FakeEInvoiceProvider } from "@fnb/api/fake-einvoice-provider";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { generateDevStackLogins } from "../../src/dev-stack/dev-stack-generated-logins";
import { type SampleShop, seedSampleShop } from "../../src/dev-stack/seed/seed-sample-shop";

const info = inject("testPostgres");
const logins = generateDevStackLogins();
const media = fileURLToPath(new URL(`../../tmp/media-${randomUUID()}`, import.meta.url));

let pool: pg.Pool;
let app: FastifyInstance;
let first: SampleShop;
let second: SampleShop;

const ROW_COUNTS =
  "SELECT (SELECT count(*) FROM brand)::int AS brands, (SELECT count(*) FROM branch)::int AS " +
  "branches, (SELECT count(*) FROM role)::int AS roles, (SELECT count(*) FROM staff)::int AS " +
  "staff, (SELECT count(*) FROM category)::int AS categories, (SELECT count(*) FROM station)" +
  "::int AS stations, (SELECT count(*) FROM product)::int AS products, (SELECT count(*) FROM " +
  "product_availability)::int AS sold_out, (SELECT count(*) FROM area)::int AS areas, " +
  "(SELECT count(*) FROM dining_table)::int AS tables, (SELECT count(*) FROM config_value)" +
  "::int AS settings, (SELECT count(*) FROM payment_webhook_endpoint)::int AS webhooks, " +
  "(SELECT count(*) FROM change_log)::int AS changes";

const rowCounts = (tenantId: string) =>
  withTenant(pool, tenantId, async (client) => (await client.query(ROW_COUNTS)).rows[0]);

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({
    pool,
    paymentSecretKey: Buffer.from(logins.paymentSecretKey, "base64"),
    einvoiceProviders: [new FakeEInvoiceProvider()],
    mediaDirectory: media,
  });
  first = await seedSampleShop(app, pool, logins);
  second = await seedSampleShop(app, pool, logins);
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await rm(media, { recursive: true, force: true });
});

describe("the sample shop seed", () => {
  it("builds the café once and adds nothing when run again on the same database", async () => {
    expect(second.tenantId).toBe(first.tenantId);
    expect(second.branchId).toBe(first.branchId);
    const counts = await rowCounts(first.tenantId);
    expect(counts).toMatchObject({
      brands: 1,
      branches: 1,
      roles: 6,
      staff: 3,
      categories: 3,
      stations: 1,
      products: 16,
      sold_out: 1,
      areas: 2,
      tables: 12,
      settings: 4,
      webhooks: 1,
    });
    await seedSampleShop(app, pool, logins);
    expect(await rowCounts(first.tenantId)).toEqual(counts);
  });

  it("gives every product its photo through the upload route, once", async () => {
    expect([first.photoCount, second.photoCount]).toEqual([15, 15]);
    const stored = await withTenant(
      pool,
      first.tenantId,
      async (client) =>
        (await client.query("SELECT DISTINCT image_key FROM product WHERE image_key IS NOT NULL"))
          .rows,
    );
    expect(stored).toHaveLength(15);
    const files = await readdir(join(media, "product-images", first.tenantId));
    expect(files.sort()).toEqual(stored.map((row) => row.image_key).sort());
  });

  it("makes one combo of two drinks that a till can sell, from products and sizes the shop has", async () => {
    // Another run on the same database: it makes nothing new and prints a code of its own, so
    // the code the till test below pairs with is still unused.
    const again = await seedSampleShop(app, pool, logins);
    const till = await app.inject({ method: "POST", url: "/devices/pair", payload: { code: again.pairingCode.code, deviceName: "Quầy combo" } });
    expect(till.statusCode).toBe(201);
    const bootstrap = await app.inject({ method: "GET", url: "/pos/bootstrap", headers: { authorization: `Device ${till.json().deviceToken}` } });
    type Product = { id: string; name: string; kind: string; basePrice: number; variants: { id: string; name: string }[]; combo: { slots: { name: string; minSelect: number; maxSelect: number; options: { productId: string; variantId: string; upcharge: number }[] }[] } | null };
    const products = bootstrap.json().menu.products as Product[];
    const combos = products.filter((product) => product.kind === "combo");
    expect(combos.map((combo) => [combo.name, combo.basePrice])).toEqual([["Combo đôi", 69_000]]);
    const slots = combos[0]?.combo?.slots ?? [];
    expect(slots.map((slot) => [slot.name, slot.minSelect, slot.maxSelect, slot.options.length])).toEqual([["Trà sữa", 1, 1, 2], ["Trà trái cây", 1, 1, 2]]);
    for (const option of slots.flatMap((slot) => slot.options)) {
      const made = products.find((product) => product.id === option.productId);
      expect(made?.kind).not.toBe("combo");
      expect(made?.variants.some((size) => size.id === option.variantId)).toBe(true);
    }
    expect(slots[0]?.options.map((option) => option.upcharge)).toEqual([0, 10_000]);
  });

  it("hands out a new pairing code on every run", () => {
    expect(second.pairingCode.code).not.toBe(first.pairingCode.code);
  });

  it("signs the owner in with the generated password, and refuses another", async () => {
    const login = (password: string) =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: logins.owner.email, password },
      });
    expect((await login(logins.owner.password)).statusCode).toBe(200);
    expect((await login(`${logins.owner.password}x`)).statusCode).toBe(401);
  });

  it("pairs a till with the printed code, whose bootstrap carries the menu and the staff", async () => {
    const paired = await app.inject({
      method: "POST",
      url: "/devices/pair",
      payload: { code: second.pairingCode.code, deviceName: "Quầy 1" },
    });
    expect(paired.statusCode).toBe(201);
    const bootstrap = await app.inject({
      method: "GET",
      url: "/pos/bootstrap",
      headers: { authorization: `Device ${paired.json().deviceToken}` },
    });
    expect(bootstrap.statusCode).toBe(200);
    const body = bootstrap.json();
    expect(body.menu.products.map((product: { name: string }) => product.name)).toContain(
      "Trà sữa trân châu",
    );
    expect(body.menu.products).toHaveLength(16);
    expect(body.menu.availability).toHaveLength(1);
    expect(body.staff.map((member: { displayName: string }) => member.displayName).sort()).toEqual([
      "Hùng",
      "Lan",
      "Minh",
    ]);
  });

  it("refuses a pairing code from an earlier run once it has been used", async () => {
    const reused = await app.inject({
      method: "POST",
      url: "/devices/pair",
      payload: { code: second.pairingCode.code, deviceName: "Quầy 2" },
    });
    expect(reused.statusCode).toBe(401);
  });
});
