import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  archiveRoleAt,
  deleteRole,
  listRoles,
  patchRole,
  postRole,
} from "../support/role-requests";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const STALE = { status: 409, body: { code: "API_ROLE_VERSION_CONFLICT" } };

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

const owner = () => shop.managerCookie;
const newRole = async () =>
  (await postRole(app, owner(), { name: "Ca tối", permissionKeys: ["refund"], thresholds: {} }))
    .body.roleId as string;
const versionOf = async (id: string) =>
  (
    (await listRoles(app, owner())).body.roles as { id: string; version: number; name: string }[]
  ).find((role) => role.id === id);

describe("changing, deleting and archiving a role as of the version the manager read", () => {
  it("refuses a rename or a change of rights made over an edit the manager did not see", async () => {
    const roleId = await newRole();
    const read = (await versionOf(roleId))?.version ?? 0;
    expect((await patchRole(app, owner(), roleId, { name: "Ca khuya" })).status).toBe(200);
    expect(await patchRole(app, owner(), roleId, { name: "Ghi đè" }, read)).toEqual(STALE);
    expect(
      await patchRole(app, owner(), roleId, { permissionKeys: [], thresholds: {} }, read),
    ).toEqual(STALE);
    expect((await versionOf(roleId))?.name).toBe("Ca khuya");
    const now = (await versionOf(roleId))?.version ?? 0;
    expect(now).toBe(read + 1);
    expect((await patchRole(app, owner(), roleId, { name: "Ca muộn" }, now)).status).toBe(200);
  });

  it("refuses a delete over an edit the manager did not see, and deletes on the version read", async () => {
    const roleId = await newRole();
    const read = (await versionOf(roleId))?.version ?? 0;
    await patchRole(app, owner(), roleId, { name: "Đã sửa" });
    expect(await deleteRole(app, owner(), roleId, read)).toEqual(STALE);
    expect(await versionOf(roleId)).toBeDefined();
    expect(await deleteRole(app, owner(), roleId, read + 1)).toEqual({ status: 204, body: null });
    expect(await versionOf(roleId)).toBeUndefined();
  });

  it("refuses to put away a role changed since it was read, and archives on the version read", async () => {
    const roleId = await newRole();
    const read = (await versionOf(roleId))?.version ?? 0;
    await patchRole(app, owner(), roleId, { name: "Sửa trước" });
    expect(await archiveRoleAt(app, owner(), roleId, read)).toEqual(STALE);
    expect((await versionOf(roleId))?.version).toBe(read + 1);
    const archived = await archiveRoleAt(app, owner(), roleId, read + 1);
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: roleId, version: read + 2 });
  });

  it("answers a role that is not there with 404 before it looks at the version", async () => {
    const missing = "0190a000-0000-7000-8000-0000000000ff";
    expect((await patchRole(app, owner(), missing, { name: "x" }, 1)).status).toBe(404);
    expect((await deleteRole(app, owner(), missing, 1)).status).toBe(404);
    expect((await archiveRoleAt(app, owner(), missing, 1)).status).toBe(404);
  });

  it("asks for the version: none, or a bad one, is a malformed request and writes nothing", async () => {
    const roleId = await newRole();
    for (const query of ["", "?version=abc", "?version=0", "?version=1&extra=1"]) {
      for (const [method, url, payload] of [
        ["PATCH", `/roles/${roleId}${query}`, { name: "Không" }],
        ["DELETE", `/roles/${roleId}${query}`, undefined],
        ["POST", `/roles/${roleId}/archive${query}`, undefined],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: { cookie: owner() },
          ...(payload === undefined ? {} : { payload }),
        });
        expect(response.statusCode).toBe(400);
      }
    }
    expect(await versionOf(roleId)).toMatchObject({ name: "Ca tối" });
  });

  it("two managers renaming the same role at once: one wins, the other is told", async () => {
    const roleId = await newRole();
    const read = (await versionOf(roleId))?.version ?? 0;
    const answers = await Promise.all([
      patchRole(app, owner(), roleId, { name: "Một" }, read),
      patchRole(app, owner(), roleId, { name: "Hai" }, read),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
  });
});
