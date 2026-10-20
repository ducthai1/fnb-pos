import { STAFF_MEMBER_ENTITY, posStaffMemberCopySchema } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { auditOf, pinScreenOf, staffTools } from "../support/staff-admin-requests";
import {
  type StaffedShop,
  currentStaff,
  hire,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let owner: { cookie: string; appUserId: string };
let tools: ReturnType<typeof staffTools>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock() });
  shop = await staffedShop(app, pool);
  owner = await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.owner });
  tools = staffTools(app, owner.cookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A cashier in the middle of a shift on the shop's till; answers their id and token. */
async function cashierAtWork() {
  const staffId = await hire(app, shop, PIN);
  const signedIn = await startShift(app, shop.deviceToken, staffId, PIN);
  expect(signedIn.status).toBe(201);
  return { staffId, token: String(signedIn.body.staffSessionToken) };
}

const lastCopy = async (staffId: string) =>
  changesOf((await feedAfter(app, shop.deviceToken)).changes, STAFF_MEMBER_ENTITY, staffId).at(-1)
    ?.snapshot;

describe("locking someone out of the tills", () => {
  it("ends the shift they are in, refuses their PIN and takes them off the PIN screens", async () => {
    const { staffId, token } = await cashierAtWork();
    expect(await pinScreenOf(app, shop.deviceToken)).toContain(staffId);
    expect(await lastCopy(staffId)).toMatchObject({ id: staffId, displayName: "Lan" });
    expect(await tools.deactivate(staffId)).toEqual({ status: 204, body: null });
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(401);
    expect((await startShift(app, shop.deviceToken, staffId, PIN)).status).toBe(404);
    expect(await pinScreenOf(app, shop.deviceToken)).not.toContain(staffId);
    expect(await lastCopy(staffId)).toBeNull();
    const [entry] = (await auditOf(pool, shop.tenantId, staffId)).filter(
      (row) => row.action === "staff.deactivated",
    );
    expect(entry).toMatchObject({
      actor_kind: "app_user",
      actor_id: owner.appUserId,
      payload: { endedSessions: 1 },
    });
    expect((await tools.list()).find((row) => row.id === staffId)?.active).toBe(false);
  });

  it("lets them back in with a new sign-in, never with the token of the shift that was ended", async () => {
    const { staffId, token } = await cashierAtWork();
    await tools.deactivate(staffId);
    expect(await tools.reactivate(staffId)).toEqual({ status: 204, body: null });
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(401);
    expect((await startShift(app, shop.deviceToken, staffId, PIN)).status).toBe(201);
    expect(await pinScreenOf(app, shop.deviceToken)).toContain(staffId);
    expect(await lastCopy(staffId)).toMatchObject({ id: staffId, active: true });
  });

  it("refuses to lock someone locked already, or to let back someone never locked", async () => {
    const staffId = await hire(app, shop, PIN);
    expect(await tools.reactivate(staffId)).toEqual({
      status: 409,
      body: { code: "API_STAFF_ALREADY_ACTIVE" },
    });
    await tools.deactivate(staffId);
    expect(await tools.deactivate(staffId)).toEqual({
      status: 409,
      body: { code: "API_STAFF_ALREADY_INACTIVE" },
    });
    const actions = (await auditOf(pool, shop.tenantId, staffId)).map((row) => row.action);
    expect(actions.filter((action) => action.startsWith("staff.de"))).toEqual([
      "staff.deactivated",
    ]);
  });
});

describe("renaming someone or moving them to another role", () => {
  it("renames them on the PIN screens and gives the new role from their next request", async () => {
    const { staffId, token } = await cashierAtWork();
    const before = await currentStaff(app, shop.deviceToken, token);
    expect(before.body).toMatchObject({ roleId: shop.roleId });
    const changed = await tools.update(staffId, {
      displayName: "  Lan Ca Tối ",
      roleId: shop.roleIds.manager,
    });
    expect(changed).toEqual({ status: 204, body: null });
    expect((await currentStaff(app, shop.deviceToken, token)).body).toMatchObject({
      displayName: "Lan Ca Tối",
      roleId: shop.roleIds.manager,
    });
    expect(await lastCopy(staffId)).toMatchObject({ displayName: "Lan Ca Tối" });
    const [entry] = (await auditOf(pool, shop.tenantId, staffId)).filter(
      (row) => row.action === "staff.updated",
    );
    expect(entry?.payload).toEqual({
      before: { displayName: "Lan", roleId: shop.roleId },
      after: { displayName: "Lan Ca Tối", roleId: shop.roleIds.manager },
    });
  });

  it("refuses a blank name, a role that does not exist and a staff member that does not", async () => {
    const staffId = await hire(app, shop, PIN);
    expect((await tools.update(staffId, { displayName: "  " })).status).toBe(400);
    expect((await tools.update(staffId, {})).status).toBe(400);
    expect(await tools.update(staffId, { roleId: shop.deviceId })).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
    expect(await tools.update(shop.deviceId, { displayName: "Mai" })).toEqual({
      status: 404,
      body: { code: "API_STAFF_NOT_FOUND" },
    });
    expect((await tools.list()).find((row) => row.id === staffId)).toMatchObject({
      displayName: "Lan",
      roleId: shop.roleId,
    });
  });
});

describe("the copy a till keeps of someone", () => {
  it("is the bootstrap's, versioned by the staff row, so a later copy always wins", async () => {
    const staffId = await hire(app, shop, PIN);
    await tools.update(staffId, { displayName: "Mai" });
    const copies = changesOf(
      (await feedAfter(app, shop.deviceToken)).changes,
      STAFF_MEMBER_ENTITY,
      staffId,
    );
    expect(copies.map((change) => posStaffMemberCopySchema.parse(change.snapshot))).toEqual([
      { id: staffId, displayName: "Lan", active: true, version: 1 },
      { id: staffId, displayName: "Mai", active: true, version: 2 },
    ]);
  });
});
