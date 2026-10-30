import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { command, line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
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

const till = () => s.tillA;

const dismissal = (rejectedType: string, extra: Record<string, unknown>, orderId?: string) => {
  const id = newId();
  const envelope = command(till(), "sync.rejection_dismissed", {
    rejectedCommandId: id,
    rejectedType,
    rejectedCode: "SYNC_ORDER_VERSION_STALE",
    ...(orderId === undefined ? {} : { orderId }),
    ...extra,
  });
  return { id, envelope };
};

const auditOf = (commandId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT actor_kind, entity_kind, entity_id, payload FROM audit_log " +
        "WHERE action = 'sync.rejection_dismissed' AND payload->>'rejectedCommandId' = $1",
      [commandId],
    );
    return rows;
  });

describe("setting aside a command the server refused", () => {
  it("is audited with who, what and why, against the order it was about", async () => {
    const draft = saveDraft(till(), [line(s.menu.coffee.id)]);
    expect((await pushOne(app, till(), draft)).status).toBe("accepted");
    const orderId = orderIdOf(draft);
    const set = dismissal("order.save_draft", { reasonCode: "handled_by_hand" }, orderId);
    expect((await pushOne(app, till(), set.envelope)).status).toBe("accepted");
    const rows = await auditOf(set.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_kind: "staff",
      entity_kind: "sales_order",
      entity_id: orderId,
      payload: {
        rejectedType: "order.save_draft",
        rejectedCode: "SYNC_ORDER_VERSION_STALE",
        reasonCode: "handled_by_hand",
      },
    });
  });

  it("is kept against the till when the command named no order", async () => {
    const set = dismissal("shift.open", { reasonCode: "no_longer_needed" });
    expect((await pushOne(app, till(), set.envelope)).status).toBe("accepted");
    expect((await auditOf(set.id))[0]).toMatchObject({
      entity_kind: "device",
    });
  });

  it.each([
    ["order.pay", "handled_by_hand"],
    ["order.mark_sent_to_kitchen", "no_longer_needed"],
    ["order.save_draft", "other"],
  ])("needs the staff member's words for %s with reason %s", async (type, reasonCode) => {
    const bare = dismissal(type, { reasonCode });
    expect((await pushOne(app, till(), bare.envelope)).code).toBe("SYNC_REASON_NOTE_REQUIRED");
    expect(await auditOf(bare.id)).toHaveLength(0);
    const said = dismissal(type, { reasonCode, reasonNote: "Đã thu tiền mặt, quản lý ghi sổ tay" });
    expect((await pushOne(app, till(), said.envelope)).status).toBe("accepted");
    expect(await auditOf(said.id)).toHaveLength(1);
  });
});
