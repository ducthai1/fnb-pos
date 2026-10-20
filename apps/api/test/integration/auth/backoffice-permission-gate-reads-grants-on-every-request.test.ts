import { encodeRoleGrants, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { backofficeSessionHook } from "../../../src/auth/backoffice-session-hook";
import { sessionCookieJar } from "../../../src/auth/session-cookie";
import { buildApp } from "../../../src/build-app";
import { systemClock } from "../../../src/clock";
import { requirePermissionHook } from "../../../src/permissions/require-permission";
import { signedInMember } from "../support/backoffice-accounts";
import { issuePairingCode } from "../support/paired-devices";
import { createRole } from "../support/roles";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const outcome = async (response: Awaited<ReturnType<FastifyInstance["inject"]>>) => ({
  status: response.statusCode,
  body: response.body === "" ? null : response.json(),
});

const issueCode = async (cookie: string) =>
  outcome(await issuePairingCode(app, cookie, shop.branchId));

describe("a member's grants", () => {
  it("are read on every request, so taking a key away works without signing out", async () => {
    const roleId = await createRole(pool, shop.tenantId, [{ key: "manage_devices" }]);
    const { cookie } = await signedInMember(app, pool, shop.tenantId, { roleId });
    expect((await issueCode(cookie)).status).toBe(201);
    const none = encodeRoleGrants([]);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE role SET permission_keys = $2, thresholds = $3 WHERE id = $1", [
        roleId,
        none.permissionKeys,
        none.thresholds,
      ]),
    );
    expect(await issueCode(cookie)).toEqual(DENIED);
  });

  it("from a corrupt role refuse loudly instead of guessing", async () => {
    const roleId = await createRole(pool, shop.tenantId, []);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE role SET permission_keys = $2 WHERE id = $1", [
        roleId,
        ["manage_devices", "order.create"],
      ]),
    );
    const { cookie } = await signedInMember(app, pool, shop.tenantId, { roleId });
    expect(await issueCode(cookie)).toEqual({ status: 500, body: { code: "API_INTERNAL" } });
  });

  it("never count a key the till could approve on the spot: nobody approves here", async () => {
    // No backoffice route is gated by such a key yet, so the gate is mounted on its own.
    const probe = buildApp({ pool });
    probe.get(
      "/probe/refund",
      {
        onRequest: [
          backofficeSessionHook(pool, systemClock, sessionCookieJar({ secure: true })),
          requirePermissionHook(pool)("refund"),
        ],
      },
      async () => ({ ok: true }),
    );
    const call = async (roleId: string) => {
      const { cookie } = await signedInMember(probe, pool, shop.tenantId, { roleId });
      return outcome(
        await probe.inject({ method: "GET", url: "/probe/refund", headers: { cookie } }),
      );
    };
    try {
      expect(await call(shop.roleIds.cashier)).toEqual(DENIED);
      expect(await call(shop.roleIds.manager)).toEqual({ status: 200, body: { ok: true } });
    } finally {
      await probe.close();
    }
  });

  it("do not matter without a session, which is still refused first", async () => {
    expect(await issueCode("fnb_session=nope")).toEqual({
      status: 401,
      body: { code: "API_AUTH_UNAUTHENTICATED" },
    });
  });
});
