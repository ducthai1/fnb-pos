import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type ClientErrorEntry } from "../../../src/client-errors/client-error-log";
import { signedInMember } from "../support/backoffice-accounts";
import { pairDevice } from "../support/paired-devices";
import { ManualClock } from "../support/manual-clock";
import {
  OTHER_ADDRESS,
  SHOP_ADDRESS,
  expectRateLimited,
  limitedApp,
} from "../support/rate-limited-app";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");

const report = (overrides: Record<string, unknown> = {}) => ({
  app: "pos",
  appVersion: "0.1.0+abc1234",
  occurredAt: "2026-10-29T10:00:00.000Z",
  kind: "error",
  message: "Cannot read properties of undefined",
  ...overrides,
});

let pool: pg.Pool;
let app: FastifyInstance;
let shop: TenantGraph;
let cookie: string;
let accountId: string;
let device: { deviceId: string; deviceToken: string };
let logged: ClientErrorEntry[];

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  logged = [];
  app = buildApp({ pool, onClientError: (entry) => logged.push(entry) });
  shop = await seedTenantGraph(pool);
  const member = await signedInMember(app, pool, shop.tenantId);
  cookie = member.cookie;
  accountId = member.accountId;
  device = await pairDevice(app, cookie, shop.ids.branch);
});

beforeEach(() => {
  logged.length = 0;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const send = (
  payload: object,
  headers: Record<string, string>,
  target: FastifyInstance = app,
  remoteAddress = "127.0.0.1",
) => target.inject({ method: "POST", url: "/client-errors", headers, payload, remoteAddress });

const asTill = () => ({ authorization: `Device ${device.deviceToken}` });

describe("reporting a fault from a screen", () => {
  it("takes a till's batch with 204 and keeps ids, never who the till's staff are", async () => {
    const response = await send({ reports: [report(), report({ kind: "render" })] }, asTill());
    expect(response.statusCode).toBe(204);
    expect(logged).toHaveLength(2);
    expect(logged[0]?.source).toEqual({
      tenantId: shop.tenantId,
      deviceId: device.deviceId,
      accountId: null,
    });
  });

  it("takes a signed-in member's report from the backoffice", async () => {
    const response = await send({ reports: [report({ app: "backoffice" })] }, { cookie });
    expect(response.statusCode).toBe(204);
    expect(logged[0]?.source).toEqual({
      tenantId: shop.tenantId,
      deviceId: null,
      accountId,
    });
  });

  it("scrubs what it keeps: no query string, email, phone number or token", async () => {
    await send(
      {
        reports: [
          report({
            message: "no order for an@example.vn, phone 0912345678, Bearer abcdef1234567890xyz",
            route: "/orders/7?customer=An#top",
            stack: `Error: x\n    at https://shop.vn/assets/app.js?token=zzz:1:2\n${"    at f (a.js:1:1)\n".repeat(400)}`,
          }),
        ],
      },
      asTill(),
    );
    const kept = logged[0]?.report;
    expect(kept?.route).toBe("/orders/7");
    const printed = JSON.stringify(kept);
    for (const secret of ["an@example.vn", "0912345678", "abcdef1234567890xyz", "token=zzz"]) {
      expect(printed).not.toContain(secret);
    }
    expect(Buffer.byteLength(kept?.stack ?? "")).toBeLessThanOrEqual(4096);
  });

  it("refuses a caller with no credential, a revoked-looking one, and a bad batch", async () => {
    expect((await send({ reports: [report()] }, {})).statusCode).toBe(401);
    expect(
      (await send({ reports: [report()] }, { authorization: "Device nope.nope" })).statusCode,
    ).toBe(401);
    expect(logged).toHaveLength(0);
    const twentyOne = Array.from({ length: 21 }, () => report());
    expect((await send({ reports: twentyOne }, asTill())).statusCode).toBe(400);
    expect((await send({ reports: [] }, asTill())).statusCode).toBe(400);
    expect((await send({ reports: [report({ kind: "other" })] }, asTill())).statusCode).toBe(400);
    expect(logged).toHaveLength(0);
  });

  it("accepts exactly twenty reports", async () => {
    const twenty = Array.from({ length: 20 }, () => report());
    expect((await send({ reports: twenty }, asTill())).statusCode).toBe(204);
    expect(logged).toHaveLength(20);
  });
});

describe("the limit on fault reports", () => {
  it("counts each till on its own and answers 429 past the limit", async () => {
    const clock = new ManualClock(new Date("2026-10-29T10:00:00Z"));
    const limited = limitedApp(pool, clock, { tillPerAddress: 50, tillPerDevice: 2 });
    const other = await pairDevice(limited, cookie, shop.ids.branch, "Quầy 2");
    const asOther = { authorization: `Device ${other.deviceToken}` };
    const answers = [];
    for (let i = 0; i < 3; i += 1) {
      answers.push(await send({ reports: [report()] }, asTill(), limited, SHOP_ADDRESS));
    }
    expect(answers.map((a) => a.statusCode)).toEqual([204, 204, 429]);
    expectRateLimited(answers[2] as (typeof answers)[number], 60);
    expect((await send({ reports: [report()] }, asOther, limited, OTHER_ADDRESS)).statusCode).toBe(
      204,
    );
    await limited.close();
  });
});
