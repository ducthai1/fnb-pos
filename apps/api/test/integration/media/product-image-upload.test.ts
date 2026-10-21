import { createHash } from "node:crypto";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { PRODUCT_IMAGE_LIMITS } from "../../../src/media/product-image-rules";
import { signedInMember } from "../support/backoffice-accounts";
import { type CatalogShop, catalogShop } from "../support/catalog-shop";
import {
  scratchMediaDirectory,
  storedPhotos,
  uploadPhoto,
} from "../support/product-image-requests";
import { OWNER_GRANTS, createRole } from "../support/roles";
import { jpegHeader, solidPng, webpHeader } from "../support/sample-image-bytes";

const info = inject("testPostgres");
const media = scratchMediaDirectory();
let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;
let cookie: string;
let allButMenu: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, mediaDirectory: media.path });
  shop = await catalogShop(app, pool);
  const tenantId = shop.tenant.tenantId;
  const member = async (grants: Parameters<typeof createRole>[2]) =>
    (
      await signedInMember(app, pool, tenantId, {
        roleId: await createRole(pool, tenantId, grants),
      })
    ).cookie;
  cookie = await member([{ key: "edit_menu" }]);
  allButMenu = await member(OWNER_GRANTS.filter((grant) => grant.key !== "edit_menu"));
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await media.remove();
});

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const photos = () => storedPhotos(media.path, shop.tenant.tenantId);

describe("uploading a product photo", () => {
  it("stores it under the hash of its bytes and serves it back, cached for good", async () => {
    const png = solidPng(40, 30, 1);
    const key = `${sha256(png)}.png`;
    const imageUrl = `/media/product-images/${shop.tenant.tenantId}/${key}`;
    expect(await uploadPhoto(app, cookie, png, "image/png")).toEqual({
      status: 201,
      body: { imageKey: key, imageUrl, width: 40, height: 30 },
    });
    const served = await app.inject({ method: "GET", url: imageUrl });
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload.equals(png)).toBe(true);
    expect(served.headers).toMatchObject({
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${sha256(png)}"`,
      "x-content-type-options": "nosniff",
    });
    const again = await app.inject({
      method: "GET",
      url: imageUrl,
      headers: { "if-none-match": `"${sha256(png)}"` },
    });
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload.length).toBe(0);
    // The same photo again is the same file, not a second one.
    expect((await uploadPhoto(app, cookie, png, "image/png")).status).toBe(200);
    expect((await photos()).filter((name) => name === key)).toHaveLength(1);
  });

  it("names the file by what the bytes are, never by the type the client claims", async () => {
    const png = solidPng(20, 20, 2);
    const answer = await uploadPhoto(app, cookie, png, "image/jpeg");
    expect(answer.body.imageKey).toBe(`${sha256(png)}.png`);
    const served = await app.inject({ method: "GET", url: String(answer.body.imageUrl) });
    expect(served.headers["content-type"]).toBe("image/png");
    expect(
      (await uploadPhoto(app, cookie, jpegHeader(640, 480), "image/png")).body.imageKey,
    ).toMatch(/\.jpg$/);
  });

  it("refuses a page or a drawing renamed as a photo, and stores nothing", async () => {
    const before = await photos();
    const page = Buffer.from("<!doctype html><script>alert(1)</script>");
    const drawing = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const refused = { status: 415, body: { code: "API_MEDIA_UNSUPPORTED_TYPE" } };
    expect(await uploadPhoto(app, cookie, page, "image/png")).toEqual(refused);
    expect(await uploadPhoto(app, cookie, drawing, "image/webp")).toEqual(refused);
    expect(await uploadPhoto(app, cookie, Buffer.alloc(0), "image/png")).toEqual(refused);
    expect(await photos()).toEqual(before);
  });

  it("takes a photo of exactly the byte limit and refuses one byte more with its own code", async () => {
    const limit = PRODUCT_IMAGE_LIMITS.maxBytes;
    expect((await uploadPhoto(app, cookie, webpHeader(800, 600, limit))).status).toBe(201);
    const before = await photos();
    expect(await uploadPhoto(app, cookie, webpHeader(800, 600, limit + 1))).toEqual({
      status: 413,
      body: { code: "API_MEDIA_TOO_LARGE" },
    });
    expect(await photos()).toEqual(before);
  });

  it("refuses a canvas larger than a tile could ever need", async () => {
    expect((await uploadPhoto(app, cookie, webpHeader(2048, 2048))).status).toBe(201);
    expect(await uploadPhoto(app, cookie, webpHeader(8000, 6000))).toEqual({
      status: 422,
      body: { code: "API_MEDIA_DIMENSIONS_NOT_ALLOWED" },
    });
  });

  it("needs edit_menu, asked before the body is read, and a session first", async () => {
    const before = await photos();
    const png = solidPng(30, 30, 3);
    expect(await uploadPhoto(app, allButMenu, png)).toEqual({
      status: 403,
      body: { code: "API_PERMISSION_DENIED" },
    });
    // Too large to be taken: refused for the permission all the same, telling nothing more.
    expect((await uploadPhoto(app, allButMenu, webpHeader(800, 600, 2_000_000))).status).toBe(403);
    expect((await uploadPhoto(app, null, png)).status).toBe(401);
    expect(await photos()).toEqual(before);
    expect((await uploadPhoto(app, cookie, png)).status).toBe(201);
  });

  it("answers that this server keeps no photos when it has no media directory", async () => {
    const bare = buildApp({ pool });
    try {
      expect(await uploadPhoto(bare, cookie, solidPng(20, 20))).toEqual({
        status: 503,
        body: { code: "API_MEDIA_NOT_CONFIGURED" },
      });
    } finally {
      await bare.close();
    }
  });
});

describe("another tenant", () => {
  it("cannot read a photo through its own address, nor touch the owner's file", async () => {
    const png = solidPng(24, 24, 4);
    const own = await uploadPhoto(app, cookie, png, "image/png");
    const other = await catalogShop(app, pool);
    const otherCookie = (await signedInMember(app, pool, other.tenant.tenantId)).cookie;
    const key = String(own.body.imageKey);
    const throughOther = `/media/product-images/${other.tenant.tenantId}/${key}`;
    expect((await app.inject({ method: "GET", url: throughOther })).statusCode).toBe(404);
    // The same bytes uploaded there become that tenant's own file; the owner's is untouched.
    const theirs = await uploadPhoto(app, otherCookie, png, "image/png");
    expect(theirs).toMatchObject({ status: 201, body: { imageUrl: throughOther } });
    expect(await photos()).toContain(key);
    expect(await storedPhotos(media.path, other.tenant.tenantId)).toEqual([key]);
  });

  it("is answered 404 for a name that tries to leave its directory", async () => {
    const tenantId = shop.tenant.tenantId;
    for (const url of [
      `/media/product-images/${tenantId}/..%2F..%2Fpassword.png`,
      `/media/product-images/${tenantId}/${"a".repeat(64)}.svg`,
      `/media/product-images/not-a-tenant/${"a".repeat(64)}.png`,
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
