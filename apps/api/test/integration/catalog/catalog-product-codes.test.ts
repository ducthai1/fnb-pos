import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const body = (
  name: string,
  extra: Record<string, unknown> = {},
  version: number | null = null,
) => ({
  version,
  brandId: shop.brandId,
  kind: "retail_item",
  name,
  basePrice: 10_000,
  pricingMode: "fixed",
  ...extra,
});

const put = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
  version: number | null = null,
) => shop.call("PUT", `/catalog/products/${id}`, body(name, extra, version));

const read = async (id: string) =>
  (await expectStatus(shop.call("GET", `/catalog/products/${id}`), 200)).json() as {
    code: string;
    version: number;
  };

describe("product codes", () => {
  it("gives a new product the next SP number of the brand when none is typed, blank counting as none", async () => {
    const [first, second, third] = [newId(), newId(), newId()];
    await expectStatus(put(first, "Nước suối"), 201);
    await expectStatus(put(second, "Bánh quy", { code: "" }), 201);
    await expectStatus(put(third, "Kẹo", { code: "   " }), 201);
    expect([(await read(first)).code, (await read(second)).code, (await read(third)).code]).toEqual(
      ["SP00001", "SP00002", "SP00003"],
    );
  });

  it("keeps the code a product has when a save leaves it out, and takes a new one when given", async () => {
    const id = newId();
    await expectStatus(put(id, "Sữa chua", { code: "SC-01" }), 201);
    await expectStatus(put(id, "Sữa chua nếp cẩm", {}, 1), 200);
    expect((await read(id)).code).toBe("SC-01");
    await expectStatus(put(id, "Sữa chua nếp cẩm", { code: "sc.02" }, 2), 200);
    expect((await read(id)).code).toBe("sc.02");
  });

  it("refuses a code another product on the menu has, whatever its case, and names why", async () => {
    await expectStatus(put(newId(), "Trà đá", { code: "TRA-DA" }), 201);
    const clash = await put(newId(), "Trà đá chanh", { code: "tra-da" });
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ code: "API_CATALOG_PRODUCT_CODE_TAKEN" });
  });

  it.each(["has space", "dấu", "a/b", "x".repeat(41)])("refuses the code %j", async (code) => {
    const refused = await put(newId(), "Sai mã", { code });
    expect(refused.statusCode).toBe(400);
  });

  it("gives an archived product's code back, and refuses to resume it while another has it", async () => {
    const [old, newer] = [newId(), newId()];
    await expectStatus(put(old, "Cũ", { code: "OLD-1" }), 201);
    await expectStatus(shop.call("POST", `/catalog/products/${old}/archive`), 200);
    await expectStatus(put(newer, "Mới", { code: "old-1" }), 201);
    const archived = await read(old);
    const resumed = await shop.call("POST", `/catalog/products/${old}/unarchive`, {
      version: archived.version,
    });
    expect(resumed.statusCode).toBe(409);
    expect(resumed.json()).toMatchObject({ code: "API_CATALOG_PRODUCT_CODE_TAKEN" });
  });

  it("lists every product with its code, and never hands a number out twice after an archive", async () => {
    const [a, b] = [newId(), newId()];
    await expectStatus(put(a, "Một"), 201);
    const firstCode = (await read(a)).code;
    await expectStatus(shop.call("POST", `/catalog/products/${a}/archive`), 200);
    await expectStatus(put(b, "Hai"), 201);
    expect((await read(b)).code).not.toBe(firstCode);
    const listed = (
      await expectStatus(shop.call("GET", `/catalog/products?brandId=${shop.brandId}`), 200)
    ).json() as {
      id: string;
      code: string;
    }[];
    expect(listed.find((row) => row.id === a)?.code).toBe(firstCode);
    expect(listed.every((row) => typeof row.code === "string" && row.code.length > 0)).toBe(true);
  });

  it("is per brand: another shop may use the same code", async () => {
    const other = await catalogShop(app, pool);
    await expectStatus(put(newId(), "Ở shop A", { code: "SAME" }), 201);
    const bodyOther = { ...body("Ở shop B", { code: "SAME" }), brandId: other.brandId };
    await expectStatus(other.call("PUT", `/catalog/products/${newId()}`, bodyOther), 201);
  });
});
