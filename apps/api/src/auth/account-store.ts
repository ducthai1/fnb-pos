import type pg from "pg";
import type { LockoutPolicy } from "./auth-policy";
import type { LoginIdentifier } from "./login-identifier";

/** The global sign-in tables, reachable only through their SECURITY DEFINER functions. */

export type LoginAttempt =
  | { kind: "unknown" }
  | { kind: "locked"; accountId: string }
  | { kind: "allowed"; accountId: string; passwordHash: string };

export async function claimLoginAttempt(
  pool: pg.Pool,
  identifier: LoginIdentifier,
  now: Date,
  policy: LockoutPolicy,
): Promise<LoginAttempt> {
  const result = await pool.query<{
    account_id: string;
    password_hash: string | null;
    allowed: boolean;
  }>(
    "SELECT account_id, password_hash, allowed " +
      "FROM fnb_auth.claim_login_attempt($1, $2, $3, $4, make_interval(secs => $5))",
    [identifier.email, identifier.phone, now, policy.maxAttempts, policy.lockMillis / 1000],
  );
  const row = result.rows[0];
  if (row === undefined) return { kind: "unknown" };
  if (!row.allowed || row.password_hash === null) {
    return { kind: "locked", accountId: row.account_id };
  }
  return { kind: "allowed", accountId: row.account_id, passwordHash: row.password_hash };
}

export async function recordLoginSuccess(pool: pg.Pool, accountId: string, now: Date) {
  await pool.query("SELECT fnb_auth.record_login_success($1, $2)", [accountId, now]);
}

export async function accountTenants(pool: pg.Pool, accountId: string): Promise<string[]> {
  const result = await pool.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM fnb_auth.account_tenants($1) AS tenant_id",
    [accountId],
  );
  return result.rows.map((row) => row.tenant_id);
}

export interface NewSession {
  id: string;
  tokenHash: string;
  accountId: string;
  tenantId: string;
  expiresAt: Date;
}

export async function createSession(pool: pg.Pool, session: NewSession, now: Date) {
  await pool.query("SELECT fnb_auth.create_session($1, $2, $3, $4, $5, $6)", [
    session.id,
    session.tokenHash,
    session.accountId,
    session.tenantId,
    session.expiresAt,
    now,
  ]);
}

export interface LiveSession {
  sessionId: string;
  accountId: string;
  tenantId: string;
}

export async function findSession(
  pool: pg.Pool,
  tokenHash: string,
  now: Date,
): Promise<LiveSession | null> {
  const result = await pool.query<{ session_id: string; account_id: string; tenant_id: string }>(
    "SELECT session_id, account_id, tenant_id FROM fnb_auth.find_session($1, $2)",
    [tokenHash, now],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : { sessionId: row.session_id, accountId: row.account_id, tenantId: row.tenant_id };
}

export async function revokeSession(pool: pg.Pool, tokenHash: string, now: Date) {
  await pool.query("SELECT fnb_auth.revoke_session($1, $2)", [tokenHash, now]);
}
