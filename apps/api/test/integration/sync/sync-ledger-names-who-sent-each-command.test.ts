import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { postgresErrorCode } from "../support/postgres-error-code";
import { freshTill } from "../support/shift-commands";
import { hire, startShift } from "../support/staffed-shop";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

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

const senderOf = async (commandId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT status, staff_id FROM applied_command WHERE command_id = $1",
      [commandId],
    );
    return rows[0];
  });

describe("the command ledger", () => {
  it("names the staff member signed in on the till, for an accepted and a refused command", async () => {
    const till = await freshTill(app, s);
    const draft = saveDraft(till, [line(s.menu.coffee.id)]);
    await pushOne(app, till, draft);
    const wrongTotal = pay(till, orderIdOf(draft), 1);
    expect((await pushOne(app, till, wrongTotal)).status).toBe("rejected");
    expect([await senderOf(draft.commandId), await senderOf(wrongTotal.commandId)]).toEqual([
      { status: "accepted", staff_id: s.tillA.staffId },
      { status: "rejected", staff_id: s.tillA.staffId },
    ]);
  });

  it("names whoever took over the till for the commands sent after the handover", async () => {
    const till = await freshTill(app, s);
    const before = saveDraft(till, [line(s.menu.coffee.id)]);
    await pushOne(app, till, before);
    const nextId = await hire(app, s.shop, "5162");
    const session = await startShift(app, till.deviceToken, nextId, "5162");
    Object.assign(till, { staffId: nextId, staffToken: session.body.staffSessionToken });
    const after = saveDraft(till, [line(s.menu.coffee.id)]);
    await pushOne(app, till, after);
    expect((await senderOf(before.commandId))?.staff_id).toBe(s.tillA.staffId);
    expect((await senderOf(after.commandId))?.staff_id).toBe(nextId);
  });

  it("refuses a sender who is staff of another tenant", async () => {
    const code = await withTenant(pool, s.shop.tenantId, (client) =>
      postgresErrorCode(() =>
        client.query(
          "INSERT INTO applied_command (id, tenant_id, device_id, staff_id, command_id, " +
            "device_seq, type, status, result) VALUES ($1, $2, $3, $4, $5, 999, " +
            "'order.save_draft', 'accepted', '{}')",
          [newId(), s.shop.tenantId, s.tillA.deviceId, other.tillA.staffId, newId()],
        ),
      ),
    );
    expect(code).toBe("23503");
  });

  it("keeps a sender unknown on a row recorded without one, as rows from before it was kept", async () => {
    const commandId = newId();
    await withTenant(pool, s.shop.tenantId, (client) =>
      client.query(
        "INSERT INTO applied_command (id, tenant_id, device_id, command_id, device_seq, type, " +
          "status, result) VALUES ($1, $2, $3, $4, 998, 'order.save_draft', 'accepted', '{}')",
        [newId(), s.shop.tenantId, s.tillA.deviceId, commandId],
      ),
    );
    expect((await senderOf(commandId))?.staff_id).toBeNull();
  });
});
