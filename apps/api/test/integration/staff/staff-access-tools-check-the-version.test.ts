import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { auditOf, staffTools } from "../support/staff-admin-requests";
import { type StaffedShop, hire, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";
const STALE = { status: 409, body: { code: "API_STAFF_VERSION_CONFLICT" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let tools: ReturnType<typeof staffTools>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  tools = staffTools(app, shop.managerCookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const rowOf = async (staffId: string) => (await tools.list()).find((row) => row.id === staffId);

describe("locking, letting back in and a new PIN, as of the member the manager read", () => {
  it("lock and let back in change the member read and refuse one changed since", async () => {
    const staffId = await hire(app, shop, PIN);
    const read = (await rowOf(staffId))?.version ?? 0;
    // Someone else renames them: the list the manager holds is out of date.
    expect((await tools.update(staffId, { displayName: "Tên mới" })).status).toBe(204);
    expect(await tools.deactivate(staffId, read)).toEqual(STALE);
    expect((await rowOf(staffId))?.active).toBe(true);
    expect(await tools.deactivate(staffId)).toEqual({ status: 204, body: null });
    const locked = (await rowOf(staffId))?.version ?? 0;
    expect(await tools.reactivate(staffId, locked - 1)).toEqual(STALE);
    expect((await rowOf(staffId))?.active).toBe(false);
    expect(await tools.reactivate(staffId, locked)).toEqual({ status: 204, body: null });
    expect((await rowOf(staffId))?.active).toBe(true);
  });

  it("a new PIN is refused on a stale read, leaving the old PIN and the audit trail as they were", async () => {
    const staffId = await hire(app, shop, PIN);
    const read = (await rowOf(staffId))?.version ?? 0;
    expect((await tools.update(staffId, { displayName: "Đổi tên" })).status).toBe(204);
    expect(await tools.resetPin(staffId, "7391", read)).toEqual(STALE);
    expect(
      (await auditOf(pool, shop.tenantId, staffId)).map((entry) => entry.action),
    ).not.toContain("staff.pin_reset");
    expect(await tools.resetPin(staffId, "7391")).toEqual({ status: 204, body: null });
  });

  it("two managers locking the same member at once: one locks, the other is told", async () => {
    const staffId = await hire(app, shop, PIN);
    const read = (await rowOf(staffId))?.version ?? 0;
    const answers = await Promise.all([
      tools.deactivate(staffId, read),
      tools.deactivate(staffId, read),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([204, 409]);
    const refused = answers.find((answer) => answer.status === 409);
    expect(["API_STAFF_VERSION_CONFLICT", "API_STAFF_ALREADY_INACTIVE"]).toContain(
      (refused?.body as { code: string }).code,
    );
  });

  it("asks for the version: none, or one that is not a number, is a malformed request", async () => {
    const staffId = await hire(app, shop, PIN);
    for (const query of ["", "?version=abc", "?version=0", "?version=1&extra=1"]) {
      for (const [method, path] of [
        ["POST", "deactivate"],
        ["POST", "reactivate"],
        ["PUT", "pin"],
      ] as const) {
        const response = await app.inject({
          method,
          url: `/staff/${staffId}/${path}${query}`,
          headers: { cookie: shop.managerCookie },
          ...(method === "PUT" ? { payload: { pin: "7391" } } : {}),
        });
        expect(response.statusCode).toBe(400);
      }
    }
    expect((await rowOf(staffId))?.active).toBe(true);
  });

  it("leaves unlocking a PIN as it was: no version asked", async () => {
    const staffId = await hire(app, shop, PIN);
    expect((await tools.unlockPin(staffId)).body).toEqual({ code: "API_STAFF_PIN_NOT_LOCKED" });
  });
});
