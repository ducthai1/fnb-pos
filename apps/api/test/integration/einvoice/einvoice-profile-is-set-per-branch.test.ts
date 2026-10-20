import { POS_FEED_ENTITY } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { readBranchEInvoiceProfile } from "../../../src/einvoice/branch-einvoice-profile";
import { FakeEInvoiceProvider } from "../../../src/einvoice/providers/fake-einvoice-provider";
import { signedInMember } from "../support/backoffice-accounts";
import { EINVOICE_PROFILE, saveEInvoiceProfile } from "../support/einvoice-profiles";
import { pullAll } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, einvoiceProviders: [new FakeEInvoiceProvider()] });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const profileUrl = (branchId: string) => `/branches/${branchId}/einvoice-profile`;

const put = (cookie: string, branchId: string, payload: object) =>
  app.inject({ method: "PUT", url: profileUrl(branchId), headers: { cookie }, payload });

const profileOf = (branchId: string) =>
  withTenant(pool, s.shop.tenantId, (client) => readBranchEInvoiceProfile(client, branchId));

describe("a branch's einvoice profile", () => {
  it("is set by someone holding manage_settings and reaches the branch's tills", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    const saved = await put(s.shop.managerCookie, s.shop.branchId, EINVOICE_PROFILE);
    expect(saved.statusCode).toBe(200);
    expect(await profileOf(s.shop.branchId)).toEqual({
      status: "set",
      source: "branch",
      profile: EINVOICE_PROFILE,
    });
    const { changes } = await pullAll(app, s.tillA, cursor);
    const config = changes.filter((c) => c.entity === POS_FEED_ENTITY.deviceConfig).at(-1);
    const settings = (config?.snapshot as { settings: Record<string, unknown> }).settings;
    expect(settings["einvoice_profile"]).toEqual(EINVOICE_PROFILE);
    expect(await profileOf(s.shop.otherBranchId)).toEqual({ status: "unset", source: "system" });
  });

  it("is refused to a manager without manage_settings, who cannot read it either", async () => {
    const manager = await signedInMember(app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.manager,
    });
    const other = { ...EINVOICE_PROFILE, sellerName: "Người khác" };
    expect((await put(manager.cookie, s.shop.otherBranchId, other)).statusCode).toBe(403);
    const read = await app.inject({
      method: "GET",
      url: profileUrl(s.shop.otherBranchId),
      headers: { cookie: manager.cookie },
    });
    expect(read.statusCode).toBe(403);
    expect(await profileOf(s.shop.otherBranchId)).toEqual({ status: "unset", source: "system" });
  });

  it.each([
    ["a template symbol without the cash register's M", { templateSymbol: "1C26TAA" }, 400],
    ["a provider this server has no adapter for", { provider: "vnpt" }, 400],
    ["a regime nobody wrote rules for", { regimeVersion: "nd70-2025" }, 400],
  ])("refuses %s", async (_case, change, status) => {
    const answer = await put(s.shop.managerCookie, s.shop.otherBranchId, {
      ...EINVOICE_PROFILE,
      ...change,
    });
    expect(answer.statusCode).toBe(status);
    expect(await profileOf(s.shop.otherBranchId)).toEqual({ status: "unset", source: "system" });
  });

  it("answers 404 for a branch the organization does not have", async () => {
    const elsewhere = await syncShop(app, pool);
    const answer = await put(s.shop.managerCookie, elsewhere.shop.branchId, EINVOICE_PROFILE);
    expect(answer.json()).toEqual({ code: "API_BRANCH_NOT_FOUND" });
  });

  it("follows the brand when the branch sets none, and ignores a value set on one till", async () => {
    const shop = await syncShop(app, pool);
    await saveEInvoiceProfile(pool, shop.shop.tenantId, { scopeKind: "brand", scopeId: shop.brandId });
    const tillValue = { ...EINVOICE_PROFILE, sellerTaxCode: "0399999999" };
    const device = { scopeKind: "device" as const, scopeId: shop.tillA.deviceId };
    await saveEInvoiceProfile(pool, shop.shop.tenantId, device, tillValue);
    const found = await withTenant(pool, shop.shop.tenantId, (client) =>
      readBranchEInvoiceProfile(client, shop.shop.branchId),
    );
    expect(found).toEqual({ status: "set", source: "brand", profile: EINVOICE_PROFILE });
  });

  it("reads a stored value the contract refuses as unreadable, never as a profile", async () => {
    const shop = await syncShop(app, pool);
    const broken = { ...EINVOICE_PROFILE, templateSymbol: "1C26TAA" };
    await saveEInvoiceProfile(pool, shop.shop.tenantId, { scopeKind: "branch", scopeId: shop.shop.branchId }, broken);
    const found = await withTenant(pool, shop.shop.tenantId, (client) =>
      readBranchEInvoiceProfile(client, shop.shop.branchId),
    );
    expect(found).toEqual({ status: "unreadable", source: "branch" });
  });
});
