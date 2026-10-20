import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { line, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const pushWith = (headers: Record<string, string>, commands: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/commands", headers, payload: { commands } });

const appliedCount = () =>
  withTenant(
    pool,
    s.shop.tenantId,
    async (client) =>
      (await client.query("SELECT count(*)::int AS n FROM applied_command")).rows[0].n as number,
  );

describe("POST /sync/commands", () => {
  it("answers 401 without a till credential, without a staff session, or with another till's", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const tillA = `Device ${s.tillA.deviceToken}`;
    const responses = [
      await pushWith({}, [draft]),
      await pushWith({ authorization: tillA }, [draft]),
      await pushWith(
        { authorization: `Device ${s.tillB.deviceToken}`, "x-staff-session": s.tillA.staffToken },
        [draft],
      ),
    ];
    expect(responses.map((response) => [response.statusCode, response.json().code])).toEqual([
      [401, "API_DEVICE_UNAUTHENTICATED"],
      [401, "API_STAFF_SESSION_INVALID"],
      [401, "API_STAFF_SESSION_INVALID"],
    ]);
    expect(await appliedCount()).toBe(0);
  });

  it("applies the same batch once the till and its staff session are both presented", async () => {
    s.tillA.nextSeq = 1;
    const response = await pushWith(
      { authorization: `Device ${s.tillA.deviceToken}`, "x-staff-session": s.tillA.staffToken },
      [saveDraft(s.tillA, [line(s.menu.coffee.id)])],
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].status).toBe("accepted");
  });

  it.each([
    ["an empty batch", []],
    ["a device_seq of 0", [{ deviceSeq: 0 }]],
    ["a business date that is not a day", [{ businessDate: "2026-02-30" }]],
    ["a command id that is not a uuid", [{ commandId: "42" }]],
  ])("answers 400 to %s and applies nothing", async (_case, overrides) => {
    const before = await appliedCount();
    const commands = overrides.map((override) => ({ ...saveDraft(s.tillA, []), ...override }));
    const response = await pushWith(
      { authorization: `Device ${s.tillA.deviceToken}`, "x-staff-session": s.tillA.staffToken },
      commands,
    );
    s.tillA.nextSeq -= commands.length;
    expect([response.statusCode, response.json().code]).toEqual([400, "API_INVALID_REQUEST"]);
    expect(await appliedCount()).toBe(before);
  });
});

describe("GET /sync/changes", () => {
  const pullWith = (headers: Record<string, string>, query: string) =>
    app.inject({ method: "GET", url: `/sync/changes${query}`, headers });

  it("answers 401 without a till credential and 400 to a cursor that is not a number", async () => {
    const till = { authorization: `Device ${s.tillA.deviceToken}` };
    const statuses = [
      (await pullWith({}, "?cursor=0")).statusCode,
      ...(
        await Promise.all(
          ["-1", "abc", "01", "1e3"].map((cursor) => pullWith(till, `?cursor=${cursor}`)),
        )
      ).map((response) => response.statusCode),
      (await pullWith(till, "")).statusCode,
    ];
    expect(statuses).toEqual([401, 400, 400, 400, 400, 200]);
  });
});
