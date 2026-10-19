import { appendAudit, withTenant } from "@fnb/db";
import type { FastifyReply } from "fastify";
import type pg from "pg";
import type { EscalatingLockoutPolicy } from "../auth/auth-policy";
import { claimAttempt } from "../security/attempt-lockout";
import { STAFF_ERROR_CODES } from "./staff-error-codes";

export type PinGate =
  | { kind: "not-found" }
  | { kind: "not-in-branch" }
  | { kind: "locked"; lockedUntil: Date }
  | {
      kind: "allowed";
      pinHash: string;
      roleId: string;
      /** The count this attempt wrote; a right PIN clears the count only if it is still this. */
      claimedAttempts: number;
    };

/**
 * Counts one PIN attempt for `staffId` on a till of `branchId`, before the PIN is checked.
 * The branch is checked before an attempt is counted, so a till of the wrong branch can
 * neither guess a PIN nor lock the staff member out. The row lock makes the count exact
 * under parallel attempts; the slow PIN check runs after commit. Starting a shift and
 * approving at the till share this count, so a PIN cannot be guessed on one and used on
 * the other. The attempt that locks writes the lock to the audit trail in the same
 * transaction, naming the till it came from, so a run of guesses never goes unseen.
 */
export async function claimPinAttempt(
  pool: pg.Pool,
  at: { tenantId: string; branchId: string; deviceId: string },
  staffId: string,
  now: Date,
  policy: EscalatingLockoutPolicy,
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
    const { failedAttempts, lockedUntil } = claim.next;
    await client.query(
      "UPDATE staff SET pin_failed_attempts = $2, pin_locked_until = $3 WHERE id = $1",
      [staffId, failedAttempts, lockedUntil],
    );
    if (lockedUntil !== null) {
      await appendAudit(client, {
        actor: { kind: "device", id: at.deviceId },
        action: "staff.pin_locked",
        entityKind: "staff",
        entityId: staffId,
        payload: { failedAttempts, lockedUntil: lockedUntil.toISOString() },
      });
    }
    const allowed = { pinHash: row.pin_hash, roleId: row.role_id };
    return { kind: "allowed", ...allowed, claimedAttempts: failedAttempts };
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

/**
 * After a right PIN: the count, and with it the growing lock, starts again. Only if no
 * other attempt was claimed while this PIN was being checked, though: those were counted
 * after this one and may have just set a lock, and a right PIN must not hand a guesser
 * a fresh run. The UPDATE takes the row lock and re-reads the count under it.
 */
export async function clearPinAttempts(
  client: pg.ClientBase,
  staffId: string,
  claimedAttempts: number,
): Promise<void> {
  await client.query(
    "UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL " +
      "WHERE id = $1 AND pin_failed_attempts = $2",
    [staffId, claimedAttempts],
  );
}
