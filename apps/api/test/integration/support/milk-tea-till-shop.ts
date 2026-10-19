import { type PosBootstrap, posBootstrapSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { expectStatus } from "./catalog-shop";
import { pearlMilkTeaDocument } from "./pearl-milk-tea-document";
import { type SyncShop, syncShop } from "./sync-shop";

export interface MilkTeaTillShop {
  s: SyncShop;
  categoryId: string;
  /** The bar of branch Q1 (shop.branchId), and the one of Q3 (shop.otherBranchId). */
  stationId: string;
  otherStationId: string;
  tea: ReturnType<typeof pearlMilkTeaDocument>;
  priceListId: string;
  /** Happy hour on milk tea at every branch, and a Q3-only price for it. */
  everyBranchItemId: string;
  otherBranchItemId: string;
  /** A backoffice call as the shop's owner. */
  manage(method: "PUT" | "POST" | "DELETE", url: string, payload?: object): Promise<unknown>;
}

/** The sync shop with a milk tea menu built through the backoffice catalog API. */
export async function milkTeaTillShop(
  app: FastifyInstance,
  pool: pg.Pool,
): Promise<MilkTeaTillShop> {
  const s = await syncShop(app, pool);
  const manage = async (method: "PUT" | "POST" | "DELETE", url: string, payload?: object) => {
    const response = await app.inject({
      method,
      url,
      headers: { cookie: s.shop.managerCookie },
      ...(payload === undefined ? {} : { payload }),
    });
    if (response.statusCode >= 300) {
      throw new Error(`${method} ${url} answered ${response.statusCode}: ${response.body}`);
    }
    return response.statusCode === 204 ? null : response.json();
  };
  const ids = {
    categoryId: newId(),
    stationId: newId(),
    otherStationId: newId(),
    priceListId: newId(),
    everyBranchItemId: newId(),
    otherBranchItemId: newId(),
  };
  const category = { version: null, brandId: s.brandId, name: "Trà sữa", sortOrder: 1 };
  await manage("PUT", `/catalog/categories/${ids.categoryId}`, category);
  for (const [id, branchId] of [
    [ids.stationId, s.shop.branchId],
    [ids.otherStationId, s.shop.otherBranchId],
  ] as const) {
    await manage("PUT", `/catalog/stations/${id}`, { version: null, branchId, name: "Bar" });
  }
  const tea = pearlMilkTeaDocument({ brandId: s.brandId, ...ids });
  await expectStatus(
    app.inject({
      method: "PUT",
      url: tea.url,
      headers: { cookie: s.shop.managerCookie },
      payload: tea.body,
    }),
    201,
  );
  const teaScope = { kind: "product", productId: tea.ids.product };
  await manage("PUT", `/catalog/price-lists/${ids.priceListId}`, {
    version: null,
    brandId: s.brandId,
    name: "Giờ vàng",
    items: [
      {
        id: ids.everyBranchItemId,
        scope: teaScope,
        timeWindow: { startMinute: 840, endMinute: 1020 },
        effect: { kind: "percent_off", rateBp: 2000, rounding: "half-up" },
      },
      {
        id: ids.otherBranchItemId,
        scope: teaScope,
        branchId: s.shop.otherBranchId,
        effect: { kind: "fixed_price", price: 33_000 },
      },
    ],
  });
  return { s, ...ids, tea, manage };
}

/** GET /pos/bootstrap with `authorization` as is (or none), status and body. */
export async function requestBootstrap(app: FastifyInstance, authorization?: string) {
  const response = await app.inject({
    method: "GET",
    url: "/pos/bootstrap",
    headers: authorization === undefined ? {} : { authorization },
  });
  return { status: response.statusCode, body: response.json() as unknown };
}

/** A till's bootstrap, read through the contract it is parsed with. */
export async function bootstrapOf(
  app: FastifyInstance,
  deviceToken: string,
): Promise<PosBootstrap> {
  const { status, body } = await requestBootstrap(app, `Device ${deviceToken}`);
  if (status !== 200) throw new Error(`bootstrap answered ${status}: ${JSON.stringify(body)}`);
  return posBootstrapSchema.parse(body);
}
