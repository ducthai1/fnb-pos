import { POS_FEED_ENTITY } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  type ConfigScope,
  clearConfigValue,
  saveConfigValue,
} from "../../../src/configuration/config-value-writes";
import {
  changesOf,
  feedAfter,
  type OtherBrandTill,
  otherBrandTill,
  withoutVersion,
} from "../support/menu-feed-probes";
import { bootstrapOf, requestBootstrap } from "../support/milk-tea-till-shop";
import { pairDevice } from "../support/paired-devices";
import { untilSettledOrWaitingOnLock } from "../support/sync-feed-probes";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let q7: OtherBrandTill;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  q7 = await otherBrandTill(app, pool, s.shop);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const writer = () => ({ tenantId: s.shop.tenantId, appUserId: newId(), now: new Date() });
const save = (scope: ConfigScope, key: string, value: unknown) =>
  withTenant(pool, s.shop.tenantId, (client) =>
    saveConfigValue(client, writer(), scope, key, value),
  );

async function cursors() {
  return {
    q1: (await feedAfter(app, s.tillA.deviceToken)).cursor,
    q3: (await feedAfter(app, s.otherBranchTill.deviceToken)).cursor,
    q7: (await feedAfter(app, q7.deviceToken)).cursor,
  };
}

/** The settings copies a till pulls after `cursor`, by the till they are for. */
async function configSent(deviceToken: string, cursor: string) {
  const { changes } = await feedAfter(app, deviceToken, cursor);
  return changesOf(changes, POS_FEED_ENTITY.deviceConfig);
}

const sortedIds = (ids: string[]) => [...ids].sort();

describe("a setting changed for a scope", () => {
  it("reaches every till of a branch with its own copy, and no till elsewhere", async () => {
    const start = await cursors();
    await save(
      { scopeKind: "branch", scopeId: s.shop.branchId },
      "void_after_sent_needs_approval",
      false,
    );
    const atQ1 = await configSent(s.tillA.deviceToken, start.q1);
    expect(sortedIds(atQ1.map((change) => change.entityId))).toEqual(
      sortedIds([s.tillA.deviceId, s.tillB.deviceId]),
    );
    const ownCopy = atQ1.find((change) => change.entityId === s.tillA.deviceId)?.snapshot;
    expect(withoutVersion(ownCopy)).toEqual(
      withoutVersion((await bootstrapOf(app, s.tillA.deviceToken)).config),
    );
    expect((ownCopy as { settings: Record<string, unknown> }).settings).toMatchObject({
      void_after_sent_needs_approval: false,
    });
    expect(await configSent(s.otherBranchTill.deviceToken, start.q3)).toEqual([]);
  });

  it("reaches the tills of every branch of a brand, and none of another brand", async () => {
    const start = await cursors();
    await save({ scopeKind: "brand", scopeId: s.brandId }, "cup_labels", true);
    const atQ3 = await configSent(s.otherBranchTill.deviceToken, start.q3);
    expect(atQ3.map((change) => change.entityId)).toEqual([s.otherBranchTill.deviceId]);
    expect((atQ3[0]?.snapshot as { flags: Record<string, boolean> }).flags.cup_labels).toBe(true);
    expect((await configSent(s.tillA.deviceToken, start.q1)).length).toBe(2);
    expect(await configSent(q7.deviceToken, start.q7)).toEqual([]);
  });

  it("reaches only the till a till-level value is set on", async () => {
    const start = await cursors();
    await save({ scopeKind: "device", scopeId: s.tillB.deviceId }, "tables", true);
    const atQ1 = await configSent(s.tillA.deviceToken, start.q1);
    expect(atQ1.map((change) => change.entityId)).toEqual([s.tillB.deviceId]);
  });

  it("refuses a charge profile no till can price with and keeps the one in effect", async () => {
    const start = await cursors();
    const before = (await bootstrapOf(app, s.tillA.deviceToken)).config.chargeProfile;
    const branch: ConfigScope = { scopeKind: "branch", scopeId: s.shop.branchId };
    await expect(save(branch, "charge_profile", { pricesIncludeTax: "yes" })).rejects.toThrow();
    expect(await configSent(s.tillA.deviceToken, start.q1)).toEqual([]);
    expect((await bootstrapOf(app, s.tillA.deviceToken)).config.chargeProfile).toEqual(before);
  });

  it("sends the inherited value once a value is cleared, and nothing when none was set", async () => {
    const start = await cursors();
    const branch: ConfigScope = { scopeKind: "branch", scopeId: s.shop.otherBranchId };
    const clear = (key: string) =>
      withTenant(pool, s.shop.tenantId, (client) =>
        clearConfigValue(client, writer(), branch, key),
      );
    await clear("void_after_sent_needs_approval");
    expect(await configSent(s.otherBranchTill.deviceToken, start.q3)).toEqual([]);
    await save(branch, "kitchen_routing", true);
    await clear("kitchen_routing");
    const sent = await configSent(s.otherBranchTill.deviceToken, start.q3);
    const routing = sent.map(
      (change) => (change.snapshot as { flags: Record<string, boolean> }).flags.kitchen_routing,
    );
    expect(routing).toEqual([true, false]);
  });
});

describe("a till paired while a brand setting is committing", () => {
  it("starts from that setting, though the write sent copies only to the tills it knew", async () => {
    let release!: () => void;
    let written!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const inside = new Promise<void>((resolve) => (written = resolve));
    const saving = withTenant(pool, s.shop.tenantId, async (client) => {
      await saveConfigValue(
        client,
        writer(),
        { scopeKind: "brand", scopeId: s.brandId },
        "qr_ordering",
        true,
      );
      written();
      await held;
    });
    await inside;
    const fresh = await pairDevice(app, s.shop.managerCookie, s.shop.branchId, "Quầy 3");
    const booting = requestBootstrap(app, `Device ${fresh.deviceToken}`);
    await untilSettledOrWaitingOnLock(pool, booting);
    release();
    await saving;
    const { status, body } = await booting;
    expect(status).toBe(200);
    expect((body as { config: { flags: Record<string, boolean> } }).config.flags.qr_ordering).toBe(
      true,
    );
  });
});
