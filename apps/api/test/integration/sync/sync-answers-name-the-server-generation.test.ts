import { SERVER_GENERATION_HEADER } from "@fnb/contracts";
import { newId, readServerGeneration, renewServerGeneration, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { postgresErrorCode } from "../support/postgres-error-code";
import { line, push, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";

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

const generationNow = () => withClient(testConnectionString(info, "app"), readServerGeneration);
const device = (token: string) => ({ authorization: `Device ${token}` });

async function answerOf(method: "GET" | "POST", url: string, payload?: object) {
  const headers = {
    ...device(s.tillA.deviceToken),
    ...(method === "POST" ? { "x-staff-session": s.tillA.staffToken } : {}),
  };
  const response = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  expect(response.statusCode).toBe(200);
  return response;
}

const deviceState = async () =>
  (await answerOf("GET", "/sync/device-state")).json() as {
    serverGeneration: string;
    lastDeviceSeq: number;
  };

describe("the server generation", () => {
  it("is named on every sync answer and the bootstrap, as the database holds it", async () => {
    const generation = await generationNow();
    expect(generation).toMatch(/^[0-9a-f-]{36}$/);
    const answers = [
      await answerOf("GET", "/sync/changes?cursor=0"),
      await answerOf("GET", "/pos/bootstrap"),
      await answerOf("GET", "/sync/device-state"),
      await answerOf("POST", "/sync/commands", {
        commands: [saveDraft(s.tillA, [line(s.menu.coffee.id)])],
      }),
    ];
    for (const answer of answers) expect(answer.headers[SERVER_GENERATION_HEADER]).toBe(generation);
  });

  it("changes on every answer once it is drawn again, as a restore draws it", async () => {
    const before = await generationNow();
    const renewed = await withClient(testConnectionString(info, "owner"), renewServerGeneration);
    expect(renewed.previous).toBe(before);
    expect(renewed.current).not.toBe(before);
    const answer = await answerOf("GET", "/sync/changes?cursor=0");
    expect(answer.headers[SERVER_GENERATION_HEADER]).toBe(renewed.current);
    expect((await deviceState()).serverGeneration).toBe(renewed.current);
  });

  it("cannot be read or changed by the app role except through its owner function", async () => {
    for (const sql of [
      "SELECT * FROM fnb_server.generation",
      "UPDATE fnb_server.generation SET generation = gen_random_uuid()",
    ]) {
      expect(await postgresErrorCode(() => pool.query(sql))).toBe(INSUFFICIENT_PRIVILEGE);
    }
  });
});

describe("the till's device state", () => {
  it("names the last device_seq the ledger holds of the asking till, 0 before any", async () => {
    const other = await app.inject({
      method: "GET",
      url: "/sync/device-state",
      headers: device(s.tillB.deviceToken),
    });
    expect(other.json().lastDeviceSeq).toBe(0);
    const before = (await deviceState()).lastDeviceSeq;
    await push(app, s.tillA, [saveDraft(s.tillA, [line(s.menu.coffee.id)])]);
    expect((await deviceState()).lastDeviceSeq).toBe(before + 1);
    expect(before + 1).toBe(s.tillA.nextSeq - 1);
  });

  it("needs the till's credential", async () => {
    const response = await app.inject({ method: "GET", url: "/sync/device-state" });
    expect(response.statusCode).toBe(401);
  });
});

describe("a command sent again after a restore", () => {
  const resentAudits = (commandId: string) =>
    withTenant(pool, s.shop.tenantId, async (client) => {
      const { rows } = await client.query(
        "SELECT payload FROM audit_log " +
          "WHERE action = 'sync.command_resent_after_restore' AND payload->>'commandId' = $1",
        [commandId],
      );
      return rows.map((row) => row.payload as Record<string, unknown>);
    });

  it("is noted in the audit once, with the generation that first took it", async () => {
    const lost = newId();
    const sent = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    const resent = { ...sent, resentFromGeneration: lost };
    const [result] = await push(app, s.tillA, [resent]);
    expect(result?.status).toBe("accepted");
    await push(app, s.tillA, [resent]);
    expect(await resentAudits(sent.commandId)).toEqual([
      {
        commandId: sent.commandId,
        commandType: "order.save_draft",
        deviceSeq: sent.deviceSeq,
        resentFromGeneration: lost,
        status: "accepted",
      },
    ]);
  });

  it("is not audited when the till sends a command for the first time", async () => {
    const sent = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await push(app, s.tillA, [sent]);
    expect(await resentAudits(sent.commandId)).toEqual([]);
  });
});
