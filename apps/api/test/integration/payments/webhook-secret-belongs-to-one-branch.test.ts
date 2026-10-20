import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { webhookSecretBox } from "../../../src/payments/webhook-secret-box";
import {
  TEST_PAYMENT_SECRET_KEY,
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
  transfersWithReference,
} from "../support/payment-webhooks";
import { rowsOf } from "../support/shift-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const UNREADABLE = "payment.webhook_secret_unreadable";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const put = (branchId: string, gateway: string, secret: string) =>
  putWebhookSecret(app, s.shop.managerCookie, branchId, gateway, secret);
const notice = (secret: string, reference = newId()) =>
  sendFakeNotice(app, s.shop.tenantId, secret, { reference, amount: 39_000, content: "ck" });
const rows = (sql: string, values: unknown[] = []) => rowsOf(pool, s.shop.tenantId, sql, values);

describe("a gateway secret", () => {
  it("is refused for a second branch on the same gateway, which could not be told apart", async () => {
    const secret = freshSecret();
    expect((await put(s.shop.branchId, "fake", secret)).statusCode).toBe(204);
    const again = await put(s.shop.otherBranchId, "fake", secret);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ code: "API_PAYMENT_SECRET_IN_USE" });
    // The branch may set its own secret again, and another gateway is another account.
    expect((await put(s.shop.branchId, "fake", secret)).statusCode).toBe(204);
    expect((await put(s.shop.otherBranchId, "sepay", secret)).statusCode).toBe(204);
  });

  it("that no longer opens is passed over and reported once; other branches still prove", async () => {
    // The broken one sorts first, so it is tried before the branch the notice belongs to.
    const [broken, working] = [s.shop.branchId, s.shop.otherBranchId].sort() as [string, string];
    const brokenSecret = freshSecret();
    const workingSecret = freshSecret();
    expect((await put(broken, "fake", brokenSecret)).statusCode).toBe(204);
    expect((await put(working, "fake", workingSecret)).statusCode).toBe(204);
    // Well formed, but sealed for another row: its owner check fails where it now is.
    const owner = { tenantId: s.shop.tenantId, branchId: working, gateway: "fake" };
    const misplaced = webhookSecretBox(TEST_PAYMENT_SECRET_KEY).seal(brokenSecret, owner);
    const [endpoint] = await rows(
      "UPDATE payment_webhook_endpoint SET secret_ciphertext = $2 " +
        "WHERE branch_id = $1 AND gateway = 'fake' RETURNING id",
      [broken, misplaced],
    );
    const reference = newId();
    expect((await notice(workingSecret, reference)).statusCode).toBe(200);
    const kept = await transfersWithReference(pool, s.shop.tenantId, reference);
    expect(kept).toEqual([expect.objectContaining({ branch_id: working })]);
    expect((await notice(brokenSecret)).statusCode).toBe(401);
    const reported = await rows(
      "SELECT entity_id, actor_kind, payload FROM audit_log WHERE action = $1",
      [UNREADABLE],
    );
    expect(reported).toEqual([
      {
        entity_id: endpoint?.id,
        actor_kind: "system",
        payload: expect.objectContaining({ branchId: broken, gateway: "fake" }),
      },
    ]);
  });
});
