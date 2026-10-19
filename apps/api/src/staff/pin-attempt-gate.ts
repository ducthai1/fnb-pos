import { withTenant } from "@fnb/db";
import type { FastifyReply } from "fastify";
import type pg from "pg";
import type { LockoutPolicy } from "../auth/auth-policy";
import { claimAttempt } from "../security/attempt-lockout";
import { STAFF_ERROR_CODES } from "./staff-error-codes";

export type PinGate =
  | { kind: "not-found" }
  | { kind: "not-in-branch" }
  | { kind: "locked"; lockedUntil: Date }
  | { kind: "allowed"; pinHash: string; roleId: string };

/**
 * Counts one PIN attempt for `staffId` on a till of `branchId`, before the PIN is checked.
 * The branch is checked before an attempt is counted, so a till of the wrong branch can
 * neither guess a PIN nor lock the staff member out. The row lock makes the count exact
 * under parallel attempts; the slow PIN check runs after commit. Starting a shift and
 * approving at the till share this count, so a PIN cannot be guessed on one and used on
 * the other.
 */
export async function claimPinAttempt(
  pool: pg.Pool,
  at: { tenantId: string; branchId: string },
  staffId: string,
  now: Date,
  policy: LockoutPolicy,
): Promise<PinGate> {
  return withTenant(pool, at.tenantId, async (client): Promise<PinGate> => {
    const found = await client.query<{
      pin_hash: string;
      role_id: string;
      pin_failed_attempts: number;
      pin_locked_until: Date | null;
      in_branch: boolean;
    }>(
      "SELECT s.pin_hash, s.role_id, s.pin_failed_attempts, s.pin_locked_until, EXISTS (SELECT 1 " +
        "FROM staff_branch b WHERE b.staff_id = s.id AND b.branch_id = $2) AS in_branch " +
        "FROM staff s WHERE s.id = $1 AND s.active FOR UPDATE OF s",
      [staffId, at.branchId],
    );
    const row = found.rows[0];
    if (row === undefined) return { kind: "not-found" };
    if (!row.in_branch) return { kind: "not-in-branch" };
    const state = { failedAttempts: row.pin_failed_attempts, lockedUntil: row.pin_locked_until };
    const claim = claimAttempt(state, now, policy);
    if (!claim.allowed) return { kind: "locked", lockedUntil: claim.lockedUntil };
    // Lockout state is not staff data: no version bump, so a till's copy of the staff
    // row does not go stale on every wrong PIN.
    await client.query(
      "UPDATE staff SET pin_failed_attempts = $2, pin_locked_until = $3 WHERE id = $1",
      [staffId, claim.next.failedAttempts, claim.next.lockedUntil],
    );
    return { kind: "allowed", pinHash: row.pin_hash, roleId: row.role_id };
  });
}

/** The answer for a gate that did not let the attempt through. */
export function refusePinGate(
  reply: FastifyReply,
  gate: Exclude<PinGate, { kind: "allowed" }>,
  now: Date,
): FastifyReply {
  if (gate.kind === "not-found")
    return reply.code(404).send({ code: STAFF_ERROR_CODES.staffNotFound });
  if (gate.kind === "not-in-branch")
    return reply.code(403).send({ code: STAFF_ERROR_CODES.notInBranch });
  const seconds = Math.ceil((gate.lockedUntil.getTime() - now.getTime()) / 1000);
  return reply
    .code(429)
    .header("retry-after", String(seconds))
    .send({ code: STAFF_ERROR_CODES.pinLocked, lockedUntil: gate.lockedUntil.toISOString() });
}

/** After a right PIN: the next wrong one starts a fresh count. */
export async function clearPinAttempts(client: pg.ClientBase, staffId: string): Promise<void> {
  await client.query(
    "UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1",
    [staffId],
  );
}
