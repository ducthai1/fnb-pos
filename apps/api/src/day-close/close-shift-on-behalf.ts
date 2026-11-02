import { appendAudit } from "@fnb/db";
import { vnd } from "@fnb/domain";
import { assessClosingCount, transitionShift } from "@fnb/domain/shift";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";
import { moneyToWire } from "../sync/order-snapshot";
import { shiftSnapshotOf } from "../sync/shift-snapshot";
import { readShift, readShiftCashBook } from "../sync/stored-shift";
import { SHIFT_ON_BEHALF_ERROR_CODES as CODES } from "./day-close-error-codes";

export interface CloseOnBehalfRequest {
  readonly tenantId: string;
  readonly shiftId: string;
  readonly appUserId: string;
  readonly countedCash: number;
  /** The version of the shift's copy the manager counted against. */
  readonly version: number;
  readonly now: Date;
}

export interface ClosedOnBehalf {
  readonly shiftId: string;
  readonly deviceId: string | null;
  readonly countedCash: number;
  readonly expectedCash: number;
  readonly difference: number;
  readonly closedAt: string;
}

export type CloseOnBehalfOutcome =
  | { readonly ok: true; readonly closed: ClosedOnBehalf }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

const refused = (status: 404 | 409, code: string) => ({ ok: false, status, code }) as const;

/** When the till's last credential stopped working, or null while one still works. */
async function revokedAt(client: pg.ClientBase, deviceId: string | null): Promise<Date | null> {
  if (deviceId === null) return null;
  const { rows } = await client.query<{ revoked_at: Date | null; live: boolean }>(
    "SELECT max(revoked_at) AS revoked_at, bool_or(revoked_at IS NULL) AS live " +
      "FROM device_credential WHERE device_id = $1",
    [deviceId],
  );
  const row = rows[0];
  return row === undefined || row.live !== false ? null : row.revoked_at;
}

/**
 * A manager closes, from the backoffice, the shift of a till revoked while the shift was
 * open: only the till's own shift.close settles a shift, and a revoked till can send none,
 * so without this the shift stays open and the branch's day never closes.
 *
 * The manager counts the drawer and types the total; the expected cash is the server's own
 * cash book, as for a till's close, and the difference is recorded whatever it is (the
 * route asks for accept_close_difference, the key that settles one). The manager answers
 * with the version of the shift they counted against: cash the till sends in between (its
 * send-the-rest flush) changes the version, and the close is refused rather than settled on
 * a figure the manager never saw. The shift row is locked first, so of two managers closing
 * at once one wins and the other is told the shift is closed. Tills of the branch get the
 * closed shift through the change feed; an audit row names the manager and that the till
 * was revoked.
 */
export async function closeShiftOnBehalf(
  client: pg.ClientBase,
  request: CloseOnBehalfRequest,
): Promise<CloseOnBehalfOutcome> {
  // The same order as a till command: the feed lock first, then the shift row.
  await lockTenantChangeFeed(client, request.tenantId);
  const shift = await readShift(client, request.shiftId, true);
  if (shift === null) return refused(404, CODES.shiftNotFound);
  if (shift.status === "closed") return refused(409, CODES.alreadyClosed);
  const revoked = await revokedAt(client, shift.deviceId);
  if (revoked === null) return refused(409, CODES.deviceNotRevoked);
  const before = await shiftSnapshotOf(client, shift);
  if (before.version !== request.version) return refused(409, CODES.versionConflict);

  const status = transitionShift(transitionShift(shift.status, "closing"), "closed");
  const { ledger } = await readShiftCashBook(client, shift);
  // No tolerance: the manager holds the key that accepts any difference.
  const assessment = assessClosingCount(ledger, vnd(request.countedCash), vnd(0n));
  const carried = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM sales_order WHERE device_id = $1 AND status = 'draft'",
    [shift.deviceId],
  );
  await client.query(
    "UPDATE shift SET status = $2, closed_at = $3, closed_by_app_user_id = $4, counted_cash = $5, " +
      "expected_cash = $6, difference = $7, open_orders_carried = $8, version = version + 1, " +
      "updated_at = $3 WHERE id = $1",
    [
      shift.id,
      status,
      request.now,
      request.appUserId,
      assessment.countedCash,
      assessment.expectedCash,
      assessment.difference,
      carried.rows[0]?.n ?? 0,
    ],
  );
  const after = await readShift(client, shift.id, false);
  if (after === null) throw new Error(`shift ${shift.id} vanished while closing`);
  await appendChange(client, request.tenantId, {
    branchId: shift.branchId,
    entity: "shift",
    entityId: shift.id,
    snapshot: await shiftSnapshotOf(client, after),
    commandId: null,
  });
  const closed: ClosedOnBehalf = {
    shiftId: shift.id,
    deviceId: shift.deviceId,
    countedCash: moneyToWire(assessment.countedCash),
    expectedCash: moneyToWire(assessment.expectedCash),
    difference: moneyToWire(assessment.difference),
    closedAt: request.now.toISOString(),
  };
  await appendAudit(client, {
    actor: { kind: "app_user", id: request.appUserId },
    action: "shift.closed_on_behalf",
    entityKind: "shift",
    entityId: shift.id,
    payload: {
      deviceId: shift.deviceId,
      deviceRevoked: true,
      deviceRevokedAt: revoked.toISOString(),
      businessDate: shift.businessDate,
      countedCash: closed.countedCash,
      expectedCash: closed.expectedCash,
      difference: closed.difference,
      openOrdersCarried: carried.rows[0]?.n ?? 0,
    },
  });
  return { ok: true, closed };
}
