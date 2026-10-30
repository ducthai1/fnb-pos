import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { answer, areaBody, areaWithTables, floorCall, tableBody } from "../support/floor-plan";
import { OWNER_GRANTS, createRole } from "../support/roles";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
const cookies = { settingsOnly: "", allButSettings: "", noKeys: "" };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  const member = async (grants: Parameters<typeof createRole>[2]) =>
    (
      await signedInMember(app, pool, shop.tenantId, {
        roleId: await createRole(pool, shop.tenantId, grants),
      })
    ).cookie;
  cookies.settingsOnly = await member([{ key: "manage_settings" }]);
  cookies.allButSettings = await member(
    OWNER_GRANTS.filter((grant) => grant.key !== "manage_settings"),
  );
  cookies.noKeys = await member([]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** Every floor write, in turn, on fresh rows, as the member behind `cookie`. */
async function everyWrite(cookie: string) {
  const call = floorCall(app, cookie);
  const owned = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B01"]);
  return [
    await answer(call("PUT", `/floor/areas/${newId()}`, areaBody(shop.branchId))),
    await answer(call("PUT", `/floor/tables/${newId()}`, tableBody(owned.areaId))),
    await answer(call("DELETE", `/floor/tables/${owned.tableIds[0]}?version=1`)),
    await answer(call("DELETE", `/floor/areas/${newId()}?version=1`)),
  ];
}

describe("floor plan writes", () => {
  it("are refused to a member whose role lacks manage_settings, even with every other key", async () => {
    expect(await everyWrite(cookies.allButSettings)).toEqual([DENIED, DENIED, DENIED, DENIED]);
  });

  it("are allowed with manage_settings alone", async () => {
    const statuses = (await everyWrite(cookies.settingsOnly)).map((outcome) => outcome.status);
    // The last one names an area that does not exist: past the permission check, a 404.
    expect(statuses).toEqual([201, 201, 200, 404]);
  });

  it("leave reading the plan to any signed-in member", async () => {
    const call = floorCall(app, cookies.noKeys);
    const reads = await Promise.all([
      answer(call("GET", `/floor/areas?branchId=${shop.branchId}`)),
      answer(call("GET", `/floor/tables?branchId=${shop.branchId}`)),
    ]);
    expect(reads.map((read) => read.status)).toEqual([200, 200]);
    const anonymous = await app.inject({ method: "GET", url: `/floor/areas?branchId=${newId()}` });
    expect(anonymous.statusCode).toBe(401);
  });
});
