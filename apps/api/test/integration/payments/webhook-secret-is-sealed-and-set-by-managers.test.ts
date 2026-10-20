import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import { freshSecret, paymentApp, putWebhookSecret } from "../support/payment-webhooks";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let otherShop: StaffedShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
  shop = await staffedShop(app, pool);
  otherShop = await staffedShop(app, pool);
  const put = await putWebhookSecret(app, shop.managerCookie, shop.branchId, "fake", secret);
  expect(put.statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const answer = (response: { statusCode: number; json: () => unknown }) => ({
  status: response.statusCode,
  body: response.json(),
});

describe("a branch's gateway secret", () => {
  it("is kept sealed, never as the secret itself", async () => {
    const rows = await withTenant(pool, shop.tenantId, async (client) => {
      const found = await client.query(
        "SELECT secret_ciphertext FROM payment_webhook_endpoint WHERE gateway = 'fake'",
      );
      return found.rows.map((row) => row.secret_ciphertext as string);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^v1\./);
    expect(rows[0]).not.toContain(secret);
  });

  it("is set only by someone who may manage settings", async () => {
    const cashier = await signedInMember(app, pool, shop.tenantId, {
      roleId: shop.roleIds.cashier,
    });
    const response = await putWebhookSecret(
      app,
      cashier.cookie,
      shop.branchId,
      "fake",
      freshSecret(),
    );
    expect(response.statusCode).toBe(403);
  });

  it("refuses a secret short enough to guess", async () => {
    const response = await putWebhookSecret(
      app,
      shop.managerCookie,
      shop.branchId,
      "fake",
      "short",
    );
    expect(response.statusCode).toBe(400);
  });

  it("refuses a branch of another shop, as missing", async () => {
    const branchId = otherShop.branchId;
    const response = await putWebhookSecret(
      app,
      shop.managerCookie,
      branchId,
      "fake",
      freshSecret(),
    );
    expect(answer(response)).toEqual({ status: 404, body: { code: "API_BRANCH_NOT_FOUND" } });
  });
});
