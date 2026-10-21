import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { PASSWORD, addMember, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type StaffedShop, hire, staffedShop } from "../support/staffed-shop";

// Postgres refuses a `urn:uuid:` id with an error the API could only answer with a 500,
// and an upper-case id compared as a string matches nothing. Every route therefore takes
// a uuid in one lowercase shape and answers anything else as a malformed request.
const info = inject("testPostgres");
const MALFORMED = { status: 400, body: { code: "API_INVALID_REQUEST" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let email: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock() });
  shop = await staffedShop(app, pool);
  email = uniqueEmail("manager");
  await addMember(pool, shop.tenantId, await createAccount(pool, { email }));
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

type Send = (id: string) => Promise<{ status: number; body: unknown }>;

function sender(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) {
  return async (headers: Record<string, string>) => {
    const response = await app.inject({ method, url, headers, ...(payload && { payload }) });
    return { status: response.statusCode, body: response.json() };
  };
}

const asManager = () => ({ cookie: shop.managerCookie });
const asTill = () => ({ authorization: `Device ${shop.deviceToken}` });

/** Each route that takes a uuid, and the status a well-formed id it does not know gets. */
const ROUTES: [string, Send, number][] = [
  [
    "a login naming an organization",
    (id) => sender("POST", "/auth/login", { email, password: PASSWORD, organizationId: id })({}),
    403,
  ],
  [
    "a pairing code for a branch",
    (id) => sender("POST", "/devices/pairing-codes", { branchId: id })(asManager()),
    404,
  ],
  ["revoking a device", (id) => sender("POST", `/devices/${id}/revoke`)(asManager()), 404],
  [
    "renaming a role",
    (id) => sender("PATCH", `/roles/${id}`, { name: "Ca tối" })(asManager()),
    404,
  ],
  ["deleting a role", (id) => sender("DELETE", `/roles/${id}`)(asManager()), 404],
  [
    "hiring with a role",
    (id) =>
      sender("POST", "/staff", {
        displayName: "Lan",
        roleId: id,
        pin: "4826",
        branchIds: [shop.branchId],
      })(asManager()),
    404,
  ],
  [
    "hiring for a branch",
    (id) =>
      sender("POST", "/staff", {
        displayName: "Lan",
        roleId: shop.roleId,
        pin: "4826",
        branchIds: [id],
      })(asManager()),
    404,
  ],
  [
    "starting a shift",
    (id) => sender("POST", "/pos/staff-sessions", { staffId: id, pin: "4826" })(asTill()),
    404,
  ],
  [
    "asking a manager to approve",
    (id) =>
      sender("POST", "/pos/approvals", {
        action: {
          key: "order_discount",
          discountRate: 500,
          subject: { orderId: "0190a000-0000-7000-8000-00000000000a" },
        },
        approverStaffId: id,
        approverPin: "4826",
      })(asTill()),
    401,
  ],
  ["reading a product", (id) => sender("GET", `/catalog/products/${id}`)(asManager()), 404],
];

const MALFORMED_IDS: [string, (id: string) => string][] = [
  ["a urn: prefix", (id) => `urn:uuid:${id}`],
  ["upper case", (id) => id.toUpperCase()],
  ["no hyphens", (id) => id.replaceAll("-", "")],
  ["a trailing character", (id) => `${id}0`],
];

describe.each(ROUTES)("%s", (_route, send, unknownStatus) => {
  it.each(MALFORMED_IDS)("answers an id with %s as malformed, never a 500", async (_c, shape) => {
    expect(await send(shape(newId()))).toEqual(MALFORMED);
  });

  it("passes a well-formed id it does not know on to the route", async () => {
    expect((await send(newId())).status).toBe(unknownStatus);
  });
});

describe("the ids a route does know", () => {
  it("sign in to the organization named in lower case, refused in upper case", async () => {
    const login = (organizationId: string) =>
      sender("POST", "/auth/login", { email, password: PASSWORD, organizationId })({});
    expect((await login(shop.tenantId)).status).toBe(200);
    expect(await login(shop.tenantId.toUpperCase())).toEqual(MALFORMED);
  });

  it("start a shift for a staff member named in lower case", async () => {
    const staffId = await hire(app, shop, "4826");
    const start = sender("POST", "/pos/staff-sessions", { staffId, pin: "4826" });
    expect((await start(asTill())).status).toBe(201);
  });
});
