import { POS_FEED_ENTITY } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { SyncChange } from "../../../src/sync/sync-wire-types";
import { signedInMember } from "../support/backoffice-accounts";
import { pullAll } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { TEST_ZALOPAY, putWallet, walletApp } from "../support/wallet-payments";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app } = walletApp(pool));
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const listWallets = (cookie: string, branchId = s.shop.branchId) =>
  app.inject({ method: "GET", url: `/payments/wallets/${branchId}`, headers: { cookie } });

const walletsIn = (changes: readonly SyncChange[], deviceId: string) => {
  const copy = changes
    .filter((c) => c.entity === POS_FEED_ENTITY.deviceConfig && c.entityId === deviceId)
    .at(-1)?.snapshot as { settings: Record<string, unknown> } | undefined;
  return copy?.settings.payment_wallets;
};

const keysAppearIn = (text: string) =>
  text.includes(TEST_ZALOPAY.key1) || text.includes(TEST_ZALOPAY.key2);

describe("a branch's ZaloPay keys", () => {
  it("are saved only by someone who may manage settings", async () => {
    const cashier = await signedInMember(app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.cashier,
    });
    const put = await putWallet(app, cashier.cookie, s.shop.branchId, {
      enabled: true,
      credentials: TEST_ZALOPAY,
    });
    expect(put.statusCode).toBe(403);
    expect((await listWallets(cashier.cookie)).statusCode).toBe(403);
  });

  it("cannot turn the wallet on before any keys are saved", async () => {
    const put = await putWallet(app, s.shop.managerCookie, s.shop.branchId, { enabled: true });
    expect(put.statusCode).toBe(409);
    expect(put.json()).toEqual({ code: "API_WALLET_KEYS_MISSING" });
  });

  it("are sealed in the database and never come back, only that they are saved", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    const put = await putWallet(app, s.shop.managerCookie, s.shop.branchId, {
      enabled: true,
      credentials: TEST_ZALOPAY,
    });
    expect(put.statusCode).toBe(204);
    expect(keysAppearIn(put.body)).toBe(false);
    const listed = await listWallets(s.shop.managerCookie);
    expect(listed.json()).toEqual({ wallets: [{ wallet: "zalopay", enabled: true, saved: true }] });
    expect(keysAppearIn(listed.body)).toBe(false);
    const sealed = await withTenant(pool, s.shop.tenantId, async (client) => {
      const { rows } = await client.query(
        "SELECT secret_ciphertext FROM payment_webhook_endpoint WHERE gateway = 'zalopay'",
      );
      return rows.map((row) => row.secret_ciphertext as string);
    });
    expect(sealed).toHaveLength(1);
    expect(sealed[0]).toMatch(/^v1\./);
    expect(keysAppearIn(sealed[0] ?? "")).toBe(false);
    const { changes } = await pullAll(app, s.tillA, cursor);
    expect(walletsIn(changes, s.tillA.deviceId)).toEqual(["zalopay"]);
    expect(keysAppearIn(JSON.stringify(changes))).toBe(false);
  });

  it("stay saved while the wallet is turned off, and the tills drop its card", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    const off = await putWallet(app, s.shop.managerCookie, s.shop.branchId, { enabled: false });
    expect(off.statusCode).toBe(204);
    expect((await listWallets(s.shop.managerCookie)).json()).toEqual({
      wallets: [{ wallet: "zalopay", enabled: false, saved: true }],
    });
    const { changes } = await pullAll(app, s.tillA, cursor);
    expect(walletsIn(changes, s.tillA.deviceId)).toEqual([]);
  });

  it("shows another branch nothing saved", async () => {
    const listed = await listWallets(s.shop.managerCookie, s.shop.otherBranchId);
    expect(listed.json()).toEqual({
      wallets: [{ wallet: "zalopay", enabled: false, saved: false }],
    });
  });
});
