import { posBootstrapSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { pairDevice } from "../support/paired-devices";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  // A shop of its own: the indexes below are counted over its one branch.
  shop = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const pairTill = (name: string) =>
  pairDevice(app, shop.shop.managerCookie, shop.shop.branchId, name);

async function bootstrapOf(deviceToken: string, asksForNumbering = true) {
  const response = await app.inject({
    method: "GET",
    url: `/pos/bootstrap${asksForNumbering ? "?call-numbering=1" : ""}`,
    headers: { authorization: `Device ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as Record<string, unknown>;
}

const numberingOf = async (deviceToken: string) =>
  posBootstrapSchema.parse(await bootstrapOf(deviceToken)).callNumbering;

const revoke = (deviceId: string) =>
  app.inject({
    method: "POST",
    url: `/devices/${deviceId}/revoke`,
    headers: { cookie: shop.shop.managerCookie },
  });

describe("a till's call index", () => {
  it("is the smallest free one of its branch, and the count says when calls carry it", async () => {
    // The shop's two tills were paired first, so they hold 1 and 2.
    expect(await numberingOf(shop.tillA.deviceToken)).toEqual({ deviceIndex: 1, tillsInBranch: 2 });
    expect(await numberingOf(shop.tillB.deviceToken)).toEqual({ deviceIndex: 2, tillsInBranch: 2 });
    const third = await pairTill("Quầy 3");
    expect(await numberingOf(third.deviceToken)).toEqual({ deviceIndex: 3, tillsInBranch: 3 });
  });

  it("goes back to the branch when the till is revoked, and the next till takes it", async () => {
    const taker = await pairTill("Quầy tạm");
    const before = await numberingOf(taker.deviceToken);
    expect(before?.deviceIndex).not.toBeNull();
    expect((await revoke(taker.deviceId)).statusCode).toBe(204);
    const next = await pairTill("Quầy thay");
    expect((await numberingOf(next.deviceToken))?.deviceIndex).toBe(before?.deviceIndex);
  });

  it("is given to a till paired before indexes existed, without pairing it again", async () => {
    const old = await pairTill("Quầy cũ");
    await withTenant(pool, shop.shop.tenantId, (client) =>
      client.query("UPDATE device SET call_index = NULL WHERE id = $1", [old.deviceId]),
    );
    const given = await numberingOf(old.deviceToken);
    expect(given?.deviceIndex).toBeGreaterThanOrEqual(1);
    expect(await numberingOf(old.deviceToken)).toEqual(given);
  });

  it("is never shared by two tills of a branch, and runs out after nine", async () => {
    const tills = [];
    for (let n = 0; n < 10; n += 1) tills.push(await pairTill(`Quầy đông ${n}`));
    const indexes = [];
    for (const till of tills) indexes.push((await numberingOf(till.deviceToken))?.deviceIndex);
    const held = indexes.filter((index) => index !== null && index !== undefined);
    expect(new Set(held).size).toBe(held.length);
    expect(Math.max(...(held as number[]))).toBeLessThanOrEqual(9);
  });

  it("is left out of the answer to a till that does not ask, which parses it strictly", async () => {
    const till = await pairTill("Quầy bản cũ");
    const body = await bootstrapOf(till.deviceToken, false);
    expect(body).not.toHaveProperty("callNumbering");
    expect(posBootstrapSchema.parse(body).callNumbering).toBeUndefined();
  });
});
