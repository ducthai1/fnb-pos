import { POS_FEED_ENTITY } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { saveConfigValue } from "../../../src/configuration/config-value-writes";
import type { SyncChange } from "../../../src/sync/sync-wire-types";
import { pullAll } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const ACCOUNT = { bankBin: "970436", accountNumber: "0011001234567", accountName: "PHO SANG Q1" };

const saveForBranch = (value: unknown) =>
  withTenant(pool, s.shop.tenantId, (client) =>
    saveConfigValue(
      client,
      { tenantId: s.shop.tenantId, appUserId: newId(), now: new Date() },
      { scopeKind: "branch", scopeId: s.shop.branchId },
      "payment_account",
      value,
    ),
  );

const accountIn = (changes: readonly SyncChange[], deviceId: string) => {
  const copy = changes
    .filter((c) => c.entity === POS_FEED_ENTITY.deviceConfig && c.entityId === deviceId)
    .at(-1)?.snapshot as { settings: Record<string, unknown> } | undefined;
  return copy?.settings["payment_account"];
};

describe("the payment_account setting", () => {
  it("reaches every till of the branch, which builds its QR from it offline", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    await saveForBranch(ACCOUNT);
    const { changes } = await pullAll(app, s.tillA, cursor);
    expect(accountIn(changes, s.tillA.deviceId)).toEqual(ACCOUNT);
    const elsewhere = await pullAll(app, s.otherBranchTill, cursor);
    expect(accountIn(elsewhere.changes, s.otherBranchTill.deviceId)).toBeUndefined();
  });

  it.each([
    ["a BIN that is not six digits", { ...ACCOUNT, bankBin: "9704" }],
    ["an account number with spaces", { ...ACCOUNT, accountNumber: "0011 0012" }],
    ["no account at all", "0011001234567"],
  ])("refuses %s, keeping what the tills had", async (_case, value) => {
    await saveForBranch(ACCOUNT);
    const { cursor } = await pullAll(app, s.tillA);
    await expect(saveForBranch(value)).rejects.toThrow("payment_account");
    const { changes } = await pullAll(app, s.tillA, cursor);
    expect(accountIn(changes, s.tillA.deviceId)).toBeUndefined();
  });
});
