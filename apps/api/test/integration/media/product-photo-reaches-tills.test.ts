import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { catalogShop } from "../support/catalog-shop";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { type MilkTeaTillShop, bootstrapOf, milkTeaTillShop } from "../support/milk-tea-till-shop";
import { scratchMediaDirectory, uploadPhoto } from "../support/product-image-requests";
import { signedInMember } from "../support/backoffice-accounts";
import { solidPng } from "../support/sample-image-bytes";

const info = inject("testPostgres");
const media = scratchMediaDirectory();
let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, mediaDirectory: media.path });
  m = await milkTeaTillShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await media.remove();
});

const teaUrl = () => m.tea.url;
const read = async () =>
  (
    await app.inject({ method: "GET", url: teaUrl(), headers: { cookie: m.s.shop.managerCookie } })
  ).json();
const tillTea = async () =>
  (await bootstrapOf(app, m.s.tillA.deviceToken)).menu.products.find(
    (p) => p.id === m.tea.ids.product,
  );
const save = (changes: Record<string, unknown>) =>
  app.inject({
    method: "PUT",
    url: teaUrl(),
    headers: { cookie: m.s.shop.managerCookie },
    payload: { ...m.tea.body, ...changes },
  });

describe("a product's photo", () => {
  it("goes out to tills with the product, stays when a save leaves it out, and comes off", async () => {
    const { cursor } = await feedAfter(app, m.s.tillA.deviceToken);
    const upload = await uploadPhoto(app, m.s.shop.managerCookie, solidPng(64, 48, 7), "image/png");
    const { imageKey, imageUrl } = upload.body as { imageKey: string; imageUrl: string };
    const stored = await read();
    expect((await save({ version: stored.version, imageKey })).statusCode).toBe(200);
    expect(await read()).toMatchObject({ imageKey, imageUrl });
    expect((await tillTea())?.imageUrl).toBe(imageUrl);
    const sent = changesOf(
      (await feedAfter(app, m.s.tillA.deviceToken, cursor)).changes,
      "catalog_product",
    );
    expect(sent.at(-1)?.snapshot).toMatchObject({ id: m.tea.ids.product, imageUrl });
    const listed = await app.inject({
      method: "GET",
      url: `/catalog/products?brandId=${m.s.brandId}`,
      headers: { cookie: m.s.shop.managerCookie },
    });
    expect(listed.json()).toContainEqual(
      expect.objectContaining({ id: m.tea.ids.product, imageUrl }),
    );

    // An older client's save names no photo: the photo stays.
    const withPhoto = await read();
    expect(
      (await save({ version: withPhoto.version, name: "Trà sữa trân châu đen" })).statusCode,
    ).toBe(200);
    expect(await read()).toMatchObject({ imageKey, name: "Trà sữa trân châu đen" });

    const before = (await feedAfter(app, m.s.tillA.deviceToken)).cursor;
    expect((await save({ version: withPhoto.version + 1, imageKey: null })).statusCode).toBe(200);
    expect(await read()).toMatchObject({ imageKey: null, imageUrl: null });
    expect(await tillTea()).not.toHaveProperty("imageUrl");
    const removed = changesOf(
      (await feedAfter(app, m.s.tillA.deviceToken, before)).changes,
      "catalog_product",
    );
    expect(removed.at(-1)?.snapshot).not.toHaveProperty("imageUrl");
  });

  it("can only be one this tenant uploaded", async () => {
    const other = await catalogShop(app, pool);
    const otherCookie = (await signedInMember(app, pool, other.tenant.tenantId)).cookie;
    const theirs = await uploadPhoto(app, otherCookie, solidPng(32, 32, 8), "image/png");
    expect(theirs.status).toBe(201);
    const stored = await read();
    const refused = await save({ version: stored.version, imageKey: theirs.body.imageKey });
    expect({ status: refused.statusCode, body: refused.json() }).toEqual({
      status: 404,
      body: { code: "API_CATALOG_IMAGE_NOT_FOUND" },
    });
    const never = await save({ version: stored.version, imageKey: `${"0".repeat(64)}.webp` });
    expect(never.statusCode).toBe(404);
    expect((await read()).version).toBe(stored.version);
    const ours = await uploadPhoto(app, m.s.shop.managerCookie, solidPng(32, 32, 8), "image/png");
    expect((await save({ version: stored.version, imageKey: ours.body.imageKey })).statusCode).toBe(
      200,
    );
  });
});
