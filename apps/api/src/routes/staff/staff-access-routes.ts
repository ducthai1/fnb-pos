import { expectedVersionQuerySchema, staffPinBodySchema } from "@fnb/contracts";
import { type AuditEntry, appendAudit, withTenant } from "@fnb/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { hashSecret } from "../../security/secret-hash";
import { announceStaffToTills } from "../../staff/announce-staff-to-tills";
import { pinProblem } from "../../staff/pin-rules";
import { STAFF_ERROR_CODES as CODES } from "../../staff/staff-error-codes";
import {
  type LockedStaff,
  type StaffAdminOutcome,
  lockedStaff,
  refusedWith,
  staffAdminGate,
  staffParams,
} from "./staff-admin-support";

interface StepDone {
  readonly audit: Omit<AuditEntry, "actor" | "entityKind" | "entityId">;
  /** Whether the tills' PIN screens change: who may sign in, not how. */
  readonly announce: boolean;
}

type Step = (
  client: pg.ClientBase,
  staff: LockedStaff,
  now: Date,
) => Promise<StaffAdminOutcome<StepDone>>;

/**
 * Locking someone out of the tills and letting them back, and the PIN they sign in with.
 * Each runs on the locked staff row and goes on the audit trail under the member who did
 * it; another organization's staff answer 404 like a missing one. Locking, letting back and
 * a new PIN are done as of the version of the member the caller read (`?version=`): a member
 * changed since is refused with 409 rather than acted on from a stale list.
 */
export function registerStaffAccessRoutes(app: FastifyInstance, context: ApiContext): void {
  const run = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    step: Step,
    /** Whether the caller names the version of the member it read (`?version=`). */
    versioned = true,
  ) => {
    const expected = versioned ? expectedVersionQuerySchema.safeParse(request.query) : null;
    if (expected !== null && !expected.success) {
      return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    }
    const { tenantId, appUserId } = backofficeAuth(request);
    const staffId = request.params.id;
    const now = context.clock.now();
    const outcome = await withTenant(context.pool, tenantId, async (client) => {
      const staff = await lockedStaff(client, staffId);
      if (staff === null) return refusedWith(404, CODES.staffNotFound);
      // Read before this change: someone else's lock, rename or role change since must not
      // be overwritten by acting on a list that no longer holds.
      if (expected !== null && staff.version !== expected.data.version) {
        return refusedWith(409, CODES.versionConflict);
      }
      const done = await step(client, staff, now);
      if (!done.ok) return done;
      const entry = { actor: { kind: "app_user", id: appUserId }, entityKind: "staff" } as const;
      await appendAudit(client, { ...entry, entityId: staffId, ...done.value.audit });
      if (done.value.announce) await announceStaffToTills(client, tenantId, staffId);
      return done;
    });
    if (!outcome.ok) return reply.code(outcome.status).send({ code: outcome.code });
    return reply.code(204).send();
  };
  const route = { onRequest: staffAdminGate(context), schema: { params: staffParams } };

  // Locked: their sessions end now, not merely while the lock lasts, so letting them back
  // later never revives a shift a till still holds the token of.
  app.post<{ Params: { id: string } }>("/staff/:id/deactivate", route, (request, reply) =>
    run(request, reply, async (client, staff, now) => {
      if (!staff.active) return refusedWith(409, CODES.alreadyInactive);
      await client.query(
        "UPDATE staff SET active = false, updated_at = $2, version = version + 1 WHERE id = $1",
        [request.params.id, now],
      );
      const ended = await client.query(
        "UPDATE staff_session SET revoked_at = $2, updated_at = $2, version = version + 1 " +
          "WHERE staff_id = $1 AND revoked_at IS NULL AND expires_at > $2",
        [request.params.id, now],
      );
      const audit = {
        action: "staff.deactivated",
        payload: { endedSessions: ended.rowCount ?? 0 },
      };
      return { ok: true, value: { audit, announce: true } };
    }),
  );

  app.post<{ Params: { id: string } }>("/staff/:id/reactivate", route, (request, reply) =>
    run(request, reply, async (client, staff, now) => {
      if (staff.active) return refusedWith(409, CODES.alreadyActive);
      await client.query(
        "UPDATE staff SET active = true, updated_at = $2, version = version + 1 WHERE id = $1",
        [request.params.id, now],
      );
      return { ok: true, value: { audit: { action: "staff.reactivated" }, announce: true } };
    }),
  );

  // A new PIN starts with a clean count: the wrong guesses were against the old one.
  app.put<{ Params: { id: string } }>("/staff/:id/pin", route, async (request, reply) => {
    const body = staffPinBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const problem = pinProblem(body.data.pin);
    if (problem !== null) {
      return reply
        .code(400)
        .send({ code: problem === "format" ? CODES.pinFormat : CODES.pinTooWeak });
    }
    // Hashed before the transaction opens: the slow part holds no connection or lock.
    const pinHash = await hashSecret(body.data.pin);
    return run(request, reply, async (client, staff, now) => {
      await client.query(
        "UPDATE staff SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, " +
          "updated_at = $3 WHERE id = $1",
        [request.params.id, pinHash, now],
      );
      const payload = { clearedFailedAttempts: staff.pin_failed_attempts };
      return {
        ok: true,
        value: { audit: { action: "staff.pin_reset", payload }, announce: false },
      };
    });
  });

  // Wrong PINs lock for longer each time, up to a day: a manager lets the person back in,
  // and the count starts again from nothing.
  app.post<{ Params: { id: string } }>("/staff/:id/pin-unlock", route, (request, reply) =>
    run(
      request,
      reply,
      async (client, staff, now) => {
        const locked = staff.pin_locked_until !== null && staff.pin_locked_until > now;
        if (!locked && staff.pin_failed_attempts === 0) return refusedWith(409, CODES.pinNotLocked);
        await client.query(
          "UPDATE staff SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1",
          [request.params.id],
        );
        const payload = {
          failedAttempts: staff.pin_failed_attempts,
          lockedUntil: locked ? staff.pin_locked_until?.toISOString() : null,
        };
        return {
          ok: true,
          value: { audit: { action: "staff.pin_unlocked", payload }, announce: false },
        };
      },
      false,
    ),
  );
}
