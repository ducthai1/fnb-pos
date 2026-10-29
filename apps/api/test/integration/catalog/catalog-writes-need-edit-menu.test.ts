import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { ROLE_TEMPLATES } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import {
  CATALOG_WRITES,
  type CatalogRequest,
  malformed,
  registeredCatalogRoutes,
} from "../support/catalog-route-requests";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { pearlMilkTeaDocument } from "../support/pearl-milk-tea-document";
import { OWNER_GRANTS, createRole } from "../support/roles";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;
/** Members of the shop, signed in, by what their role holds. */
const cookies = { menuOnly: "", allButMenu: "", shiftManager: "", noKeys: "" };
let productUrl: string;
let priceListUrl: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
  const tenantId = shop.tenant.tenantId;
  const member = async (grants: Parameters<typeof createRole>[2]) =>
    (
      await signedInMember(app, pool, tenantId, {
        roleId: await createRole(pool, tenantId, grants),
      })
    ).cookie;
  cookies.menuOnly = await member([{ key: "edit_menu" }]);
  cookies.allButMenu = await member(OWNER_GRANTS.filter((grant) => grant.key !== "edit_menu"));
  cookies.shiftManager = await member(ROLE_TEMPLATES.manager.grants);
  cookies.noKeys = await member([]);

  const product = pearlMilkTeaDocument(shop);
  productUrl = product.url;
  await expectStatus(shop.call("PUT", productUrl, product.body), 201);
  priceListUrl = `/catalog/price-lists/${newId()}`;
  await expectStatus(
    shop.call("PUT", priceListUrl, {
      version: null,
      brandId: shop.brandId,
      name: "Giờ vàng",
      items: [],
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** The request made by the member signed in with `cookie`, or by nobody. */
async function send(request: CatalogRequest, cookie: string | null) {
  const response = await app.inject({
    method: request.method,
    url: request.url,
    headers: cookie === null ? {} : { cookie },
    ...(request.payload === undefined ? {} : { payload: request.payload }),
  });
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
}

/** What the shop's owner sees through the read that shows a write's effect. */
const seen = async (effect: CatalogRequest): Promise<unknown> =>
  (await shop.call("GET", effect.url)).json();

const REFUSED_MEMBERS = [
  ["a role holding every key but edit_menu", "allButMenu"],
  ["the shift manager template", "shiftManager"],
] as const;

describe.each(CATALOG_WRITES)("$route needs edit_menu", (write) => {
  it("is carried out for a member whose role holds edit_menu and nothing else", async () => {
    const { request, effect } = await write.prepare(shop);
    const before = await seen(effect);
    expect((await send(request, cookies.menuOnly)).status).toBe(write.status);
    expect(await seen(effect)).not.toEqual(before);
  });

  it.each(REFUSED_MEMBERS)("is refused to %s and changes nothing", async (_label, who) => {
    const { request, effect } = await write.prepare(shop);
    const before = await seen(effect);
    expect(await send(request, cookies[who])).toEqual(DENIED);
    expect(await seen(effect)).toEqual(before);
  });

  it("refuses before parsing, so a refusal says nothing about the request", async () => {
    const { request } = await write.prepare(shop);
    expect(await send(malformed(request), cookies.allButMenu)).toEqual(DENIED);
    expect(await send(malformed(request), cookies.menuOnly)).toEqual({
      status: 400,
      body: { code: "API_INVALID_REQUEST" },
    });
  });

  it("still asks for a session first", async () => {
    const { request } = await write.prepare(shop);
    expect((await send(request, null)).status).toBe(401);
  });
});

const READS = () => [
  { route: "GET /catalog/products/:id", url: productUrl },
  { route: "GET /catalog/products", url: `/catalog/products?brandId=${shop.brandId}` },
  { route: "GET /catalog/price-lists/:id", url: priceListUrl },
  { route: "GET /catalog/price-lists", url: `/catalog/price-lists?brandId=${shop.brandId}` },
  { route: "GET /catalog/availability", url: `/catalog/availability?branchId=${shop.branchId}` },
  { route: "GET /catalog/categories", url: `/catalog/categories?brandId=${shop.brandId}` },
  { route: "GET /catalog/stations", url: `/catalog/stations?branchId=${shop.branchId}` },
];

describe("reading the menu", () => {
  it("is open to any signed-in member, one whose role holds no key included", async () => {
    for (const { url } of READS()) {
      expect(await send({ method: "GET", url }, cookies.noKeys)).toEqual({
        status: 200,
        body: await seen({ method: "GET", url }),
      });
    }
  });

  it("is refused without a session", async () => {
    for (const { url } of READS()) {
      expect((await send({ method: "GET", url }, null)).status).toBe(401);
    }
  });
});

describe("the tables above", () => {
  it("cover every catalog route, so a new write cannot slip in without the gate", async () => {
    const tabled = [
      ...CATALOG_WRITES.map((write) => write.route),
      ...READS().map((read) => read.route),
    ];
    expect(await registeredCatalogRoutes()).toEqual(tabled.sort());
  });
});
