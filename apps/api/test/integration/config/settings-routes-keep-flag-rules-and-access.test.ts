import { POS_FEED_ENTITY, settingsViewSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { createRole } from "../support/roles";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let other: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  other = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function call(
  method: "GET" | "PUT" | "DELETE",
  url: string,
  value?: unknown,
  cookie = s.shop.managerCookie,
) {
  const payload = value === undefined ? {} : { payload: { value } };
  const response = await app.inject({ method, url, headers: { cookie }, ...payload });
  return { status: response.statusCode, body: response.json() };
}

const at = (scope: string, id: string, key: string) => `/settings/${scope}/${id}/${key}`;
const branchQ1 = (key: string) => at("branch", s.shop.branchId, key);
const brand = (key: string) => at("brand", s.brandId, key);
const storedAt = (scopeId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT key FROM config_value WHERE scope_id = $1 ORDER BY key",
      [scopeId],
    );
    return rows.map((row) => row.key as string);
  });

describe("the flag rules, judged after the write", () => {
  it("refuses a switch whose requirement is off, keeps nothing and sends nothing", async () => {
    const { cursor } = await feedAfter(app, s.tillA.deviceToken);
    expect(await call("PUT", branchQ1("qr_ordering"), true)).toEqual({
      status: 400,
      body: {
        code: "FLAGS_REQUIRES_MISSING",
        details: {
          flag: "qr_ordering",
          other: "tables",
          scopeKind: "branch",
          scopeId: s.shop.branchId,
        },
      },
    });
    expect(await storedAt(s.shop.branchId)).toEqual([]);
    const { changes } = await feedAfter(app, s.tillA.deviceToken, cursor);
    expect(changesOf(changes, POS_FEED_ENTITY.deviceConfig)).toEqual([]);
  });

  it("takes the same switch once its requirement is on, and refuses clearing the requirement", async () => {
    expect((await call("PUT", branchQ1("tables"), true)).status).toBe(200);
    expect((await call("PUT", branchQ1("qr_ordering"), true)).status).toBe(200);
    const clearing = await call("DELETE", branchQ1("tables"));
    expect(clearing).toMatchObject({ status: 400, body: { code: "FLAGS_REQUIRES_MISSING" } });
    expect(await storedAt(s.shop.branchId)).toEqual(["qr_ordering", "tables"]);
  });

  it("refuses a brand switch that conflicts with what one branch set, naming that branch", async () => {
    expect((await call("PUT", brand("inventory_tracking"), true)).status).toBe(200);
    const q3 = at("branch", s.shop.otherBranchId, "allow_negative_stock");
    expect((await call("PUT", q3, true)).status).toBe(200);
    expect(await call("PUT", brand("auto_86_on_zero_stock"), true)).toEqual({
      status: 400,
      body: {
        code: "FLAGS_EXCLUDES_BOTH_ON",
        details: {
          flag: "auto_86_on_zero_stock",
          other: "allow_negative_stock",
          scopeKind: "branch",
          scopeId: s.shop.otherBranchId,
        },
      },
    });
    expect(await storedAt(s.brandId)).toEqual(["inventory_tracking"]);
    // Q3 lets go of selling below zero: now the brand may mark items sold out at zero.
    expect((await call("DELETE", q3)).status).toBe(200);
    expect((await call("PUT", brand("auto_86_on_zero_stock"), true)).status).toBe(200);
  });

  it("judges a till's own switch with what its branch and brand set", async () => {
    const view = settingsViewSchema.parse(
      (await call("GET", `/settings?scope=device&scopeId=${s.tillA.deviceId}`)).body,
    );
    expect(view.entries.find((entry) => entry.key === "qr_ordering")).toMatchObject({
      value: true,
      source: "branch",
    });
    expect((await call("PUT", at("device", s.tillA.deviceId, "cup_labels"), true)).status).toBe(
      200,
    );
  });
});

describe("who may read and change settings", () => {
  it("refuses a member without manage_settings, before reading the request", async () => {
    const roleId = await createRole(pool, s.shop.tenantId, [
      { key: "manage_devices" },
      { key: "edit_menu" },
    ]);
    const { cookie } = await signedInMember(app, pool, s.shop.tenantId, { roleId });
    expect(
      await call("GET", `/settings?scope=branch&scopeId=${s.shop.branchId}`, undefined, cookie),
    ).toEqual(DENIED);
    expect(await call("PUT", branchQ1("kitchen_routing"), true, cookie)).toEqual(DENIED);
    expect(await call("DELETE", branchQ1("tables"), undefined, cookie)).toEqual(DENIED);
    expect(await call("PUT", branchQ1("no_such_key"), "x", cookie)).toEqual(DENIED);
    expect(await storedAt(s.shop.branchId)).not.toContain("kitchen_routing");
  });

  it("shows and changes nothing of another organization's brand, branch or till", async () => {
    const notFound = { status: 404, body: { code: "API_SETTINGS_SCOPE_NOT_FOUND" } };
    const stranger = other.shop.managerCookie;
    expect(
      await call("GET", `/settings?scope=branch&scopeId=${s.shop.branchId}`, undefined, stranger),
    ).toEqual(notFound);
    expect(await call("PUT", branchQ1("kitchen_routing"), true, stranger)).toEqual(notFound);
    expect(await call("PUT", brand("cup_labels"), true, stranger)).toEqual(notFound);
    expect(
      await call("DELETE", at("device", s.tillA.deviceId, "cup_labels"), undefined, stranger),
    ).toEqual(notFound);
    expect(await storedAt(s.brandId)).not.toContain("cup_labels");
    expect(await storedAt(s.tillA.deviceId)).toEqual(["cup_labels"]);
  });

  it("refuses a scope or id that is not one", async () => {
    const invalid = { status: 400, body: { code: "API_INVALID_REQUEST" } };
    expect(await call("GET", `/settings?scope=tenant&scopeId=${s.shop.branchId}`)).toEqual(invalid);
    expect(
      await call("GET", `/settings?scope=branch&scopeId=${s.shop.branchId.toUpperCase()}`),
    ).toEqual(invalid);
    expect(await call("PUT", at("tenant", s.shop.branchId, "tables"), true)).toEqual(invalid);
  });
});
