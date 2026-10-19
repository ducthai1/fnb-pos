import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type pg from "pg";
import { hashSecret } from "../../../src/security/secret-hash";

export const PASSWORD = "Mật khẩu đúng 2026";

/** An account signing in with `email`, created the way sign-up will: through fnb_auth. */
export async function createAccount(
  pool: pg.Pool,
  identifier: { email: string } | { phone: string },
  password = PASSWORD,
): Promise<string> {
  const id = newId();
  const email = "email" in identifier ? identifier.email : null;
  const phone = "phone" in identifier ? identifier.phone : null;
  await pool.query("SELECT fnb_auth.create_account($1, $2, $3, $4, now())", [
    id,
    email,
    phone,
    await hashSecret(password),
  ]);
  return id;
}

/** Makes the account a member of the tenant, acting as a new app_user there. */
export async function addMember(
  pool: pg.Pool,
  tenantId: string,
  accountId: string,
  options: { displayName?: string; status?: "active" | "suspended" } = {},
): Promise<{ appUserId: string; membershipId: string }> {
  const appUserId = newId();
  const membershipId = newId();
  await withTenant(pool, tenantId, async (client) => {
    await client.query("INSERT INTO app_user (id, tenant_id, display_name) VALUES ($1, $2, $3)", [
      appUserId,
      tenantId,
      options.displayName ?? "Chủ quán",
    ]);
    await client.query(
      "INSERT INTO membership (id, tenant_id, account_id, app_user_id, status) VALUES ($1, $2, $3, $4, $5)",
      [membershipId, tenantId, accountId, appUserId, options.status ?? "active"],
    );
  });
  return { appUserId, membershipId };
}

export function uniqueEmail(label: string): string {
  return `${label}-${newId()}@example.test`;
}

export function login(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/auth/login", payload });
}

/** The `name=value` pair of the response's Set-Cookie, ready for a Cookie header. */
export function cookieOf(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : header;
  if (first === undefined) throw new Error("response set no cookie");
  return first.split(";")[0] ?? "";
}

/** Signs in and returns the session cookie, failing loudly if the login did not succeed. */
export async function signIn(
  app: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<string> {
  const response = await login(app, payload);
  if (response.statusCode !== 200) {
    throw new Error(`login answered ${response.statusCode}: ${response.body}`);
  }
  return cookieOf(response);
}
