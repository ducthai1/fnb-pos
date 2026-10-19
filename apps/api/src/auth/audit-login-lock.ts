import { appendAudit, withTenant } from "@fnb/db";
import type pg from "pg";
import { accountTenants } from "./account-store";

export interface LoginLock {
  accountId: string;
  failedAttempts: number;
  lockedUntil: Date;
}

/**
 * Writes a login lock to the audit trail of every organization the account belongs to,
 * so each one's backoffice can see that someone was guessing the password. Nobody is
 * signed in to name as the actor; the lock is the server's own decision, so it is the
 * system that acts.
 */
export async function auditLoginLock(pool: pg.Pool, lock: LoginLock): Promise<void> {
  for (const tenantId of await accountTenants(pool, lock.accountId)) {
    await withTenant(pool, tenantId, (client) =>
      appendAudit(client, {
        actor: { kind: "system" },
        action: "account.login_locked",
        entityKind: "account",
        entityId: lock.accountId,
        payload: {
          failedAttempts: lock.failedAttempts,
          lockedUntil: lock.lockedUntil.toISOString(),
        },
      }),
    );
  }
}
