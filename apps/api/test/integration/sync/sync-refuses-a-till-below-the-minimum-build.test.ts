import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MINIMUM = 1_761_800_000;

let pool: pg.Pool;
let app: FastifyInstance;
let open: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock(), minimumPosBuild: MINIMUM });
  open = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await open.close();
  await pool.end();
});

const headersOf = (build?: string) => ({
  authorization: `Device ${s.tillA.deviceToken}`,
  "x-staff-session": s.tillA.staffToken,
  ...(build === undefined ? {} : { "x-fnb-pos-build": build }),
});

const push = (server: FastifyInstance, build?: string) =>
  server.inject({
    method: "POST",
    url: "/sync/commands",
    headers: headersOf(build),
    payload: { commands: [saveDraft(s.tillA, [line(s.menu.coffee.id)])] },
  });

const appliedCount = () =>
  withTenant(
    pool,
    s.shop.tenantId,
    async (client) =>
      (await client.query("SELECT count(*)::int AS n FROM applied_command")).rows[0].n as number,
  );

describe("a server with a minimum POS build", () => {
  it("answers 426 to a till below it, on every sync endpoint, and applies nothing", async () => {
    const before = await appliedCount();
    const below = String(MINIMUM - 1);
    const answers = [
      await push(app, below),
      await app.inject({
        method: "GET",
        url: "/sync/changes?cursor=0&limit=10",
        headers: headersOf(below),
      }),
      await app.inject({ method: "GET", url: "/sync/device-state", headers: headersOf(below) }),
    ];
    expect(answers.map((answer) => [answer.statusCode, answer.json().code])).toEqual([
      [426, "API_POS_RELEASE_TOO_OLD"],
      [426, "API_POS_RELEASE_TOO_OLD"],
      [426, "API_POS_RELEASE_TOO_OLD"],
    ]);
    expect(await appliedCount()).toBe(before);
  });

  it("takes a till at the minimum or above it", async () => {
    s.tillA.nextSeq = 1;
    expect((await push(app, String(MINIMUM))).statusCode).toBe(200);
    expect((await push(app, String(MINIMUM + 5_000))).statusCode).toBe(200);
  });

  it("takes a till that names no build or something that is not one", async () => {
    expect((await push(app)).statusCode).toBe(200);
    expect((await push(app, "0.0.0+abc1234")).statusCode).toBe(200);
  });

  it("tells a revoked till it is revoked before it tells it to update", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/sync/device-state",
      headers: { authorization: "Device nobody.nothing", "x-fnb-pos-build": "1" },
    });
    expect([response.statusCode, response.json().code]).toEqual([401, "API_DEVICE_UNAUTHENTICATED"]);
  });

  it("serves every build when no minimum is set", async () => {
    expect((await push(open, "1")).statusCode).toBe(200);
  });
});
