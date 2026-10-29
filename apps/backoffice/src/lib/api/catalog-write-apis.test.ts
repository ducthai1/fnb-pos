import { describe, expect, it } from "vitest";
import { httpCatalogApi } from "./catalog-api";
import { httpPriceListApi } from "./price-list-api";
import { httpShopTemplateApi } from "./shop-template-api";

const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** A fetch that answers with `status` and `body`, recording what was asked. */
function answering(status: number, body: unknown) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

describe("selling a product again", () => {
  it("posts the version it saw and reads the new one", async () => {
    const reply = answering(200, { id: id(1), version: 4, archivedAt: null });
    expect(await httpCatalogApi("/api", reply.fetchImpl).resumeProduct(id(1), 3)).toEqual({ ok: true, value: { version: 4 } });
    expect(reply.calls).toEqual([{ url: `/api/catalog/products/${id(1)}/unarchive`, method: "POST", body: { version: 3 } }]);
  });

  it("refuses an answer that still says archived, and passes a refusal on with its code", async () => {
    expect((await httpCatalogApi("/api", answering(200, { id: id(1), version: 4, archivedAt: "2026-10-29T03:00:00.000Z" }).fetchImpl).resumeProduct(id(1), 3)).ok).toBe(false);
    expect(await httpCatalogApi("/api", answering(409, { code: "API_CATALOG_VERSION_CONFLICT" }).fetchImpl).resumeProduct(id(1), 3)).toMatchObject({ ok: false, status: 409, code: "API_CATALOG_VERSION_CONFLICT" });
  });
});

describe("stations", () => {
  it("are written and deleted by id, and a station read without a version is refused", async () => {
    const station = { id: id(2), branchId: id(3), name: "Bar", version: 1 };
    const put = answering(201, station);
    expect(await httpCatalogApi("/api", put.fetchImpl).putStation(id(2), { version: null, branchId: id(3), name: "Bar" })).toEqual({ ok: true, value: station });
    expect(put.calls[0]).toEqual({ url: `/api/catalog/stations/${id(2)}`, method: "PUT", body: { version: null, branchId: id(3), name: "Bar" } });
    const removed = answering(204, null);
    expect(await httpCatalogApi("/api", removed.fetchImpl).deleteStation(id(2))).toEqual({ ok: true, value: true });
    expect(removed.calls[0]).toMatchObject({ url: `/api/catalog/stations/${id(2)}`, method: "DELETE" });
    expect((await httpCatalogApi("/api", answering(200, { id: id(2), branchId: id(3), name: "Bar" }).fetchImpl).putStation(id(2), { version: 1, branchId: id(3), name: "Bar" })).ok).toBe(false);
  });
});

describe("price lists", () => {
  it("list with their rule counts, and refuse a row without one", async () => {
    const row = { id: id(4), brandId: id(5), name: "Giờ vàng", version: 2, itemCount: 3 };
    const reply = answering(200, [row]);
    expect(await httpPriceListApi("/api", reply.fetchImpl).listPriceLists(id(5))).toEqual({ ok: true, value: [{ id: id(4), name: "Giờ vàng", version: 2, itemCount: 3 }] });
    expect(reply.calls[0]?.url).toBe(`/api/catalog/price-lists?brandId=${id(5)}`);
    expect((await httpPriceListApi("/api", answering(200, [{ id: id(4), name: "x", version: 1 }]).fetchImpl).listPriceLists(id(5))).ok).toBe(false);
  });

  it("read a list whole, and refuse one with a rule the contract does not know", async () => {
    const doc = { id: id(4), brandId: id(5), name: "Giờ vàng", version: 2, items: [] };
    expect(await httpPriceListApi("/api", answering(200, doc).fetchImpl).getPriceList(id(4))).toEqual({ ok: true, value: doc });
    expect((await httpPriceListApi("/api", answering(200, { ...doc, items: [{ id: id(6) }] }).fetchImpl).getPriceList(id(4))).ok).toBe(false);
  });

  it("delete by id", async () => {
    const reply = answering(204, null);
    expect(await httpPriceListApi("/api", reply.fetchImpl).deletePriceList(id(4))).toEqual({ ok: true, value: true });
    expect(reply.calls[0]).toMatchObject({ url: `/api/catalog/price-lists/${id(4)}`, method: "DELETE" });
  });
});

describe("shop templates", () => {
  const plan = { templateId: "cafe", branchId: id(3), changes: [{ kind: "add_category", name: "Cà phê" }], kept: [] };
  it("ask for a plan and apply one, reading what the contract says", async () => {
    const asked = answering(200, plan);
    expect(await httpShopTemplateApi("/api", asked.fetchImpl).getShopTemplatePlan("cafe", id(3))).toEqual({ ok: true, value: plan });
    expect(asked.calls[0]?.url).toBe(`/api/shop-templates/cafe/plan?branchId=${id(3)}`);
    const applied = answering(200, plan);
    await httpShopTemplateApi("/api", applied.fetchImpl).applyShopTemplate("cafe", id(3));
    expect(applied.calls[0]).toEqual({ url: "/api/shop-templates/cafe/apply", method: "POST", body: { branchId: id(3) } });
  });

  it("refuse a plan with a change of an unknown kind", async () => {
    expect((await httpShopTemplateApi("/api", answering(200, { ...plan, changes: [{ kind: "drop_everything" }] }).fetchImpl).getShopTemplatePlan("cafe", id(3))).ok).toBe(false);
  });
});
