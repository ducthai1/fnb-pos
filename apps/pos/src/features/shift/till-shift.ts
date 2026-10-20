import { openShiftPayloadSchema } from "@fnb/contracts";
import { type DenominationCount, countedTotal } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { newId } from "../ids/new-id";
import { type TillPlace, businessDateAt, moneyToWire, tillCommand } from "../order/till-command";

/** The till's shift as far as selling needs it: which one its sales go into. */
export interface TillShift {
  readonly id: string;
  readonly status: string;
  readonly businessDate: string;
}

/**
 * The shift this till has not closed, from its own expectation or the server's copy. One
 * per till at a time (the server refuses a second), so the first unclosed one is it.
 */
export async function unclosedShiftOf(
  client: Pick<SyncClient, "snapshots">,
  deviceId: string,
): Promise<TillShift | null> {
  for (const view of await client.snapshots("shift")) {
    const { id, deviceId: owner, status, businessDate } = view.snapshot;
    if (
      owner === deviceId &&
      typeof id === "string" &&
      typeof status === "string" &&
      status !== "closed" &&
      typeof businessDate === "string"
    ) {
      return { id, status, businessDate };
    }
  }
  return null;
}

/** shift.open on the float the cashier counted, note by note; the domain adds them up. */
export function openShiftCommand(
  place: TillPlace,
  staffId: string,
  counts: readonly DenominationCount[],
  at: number,
): LocalCommand {
  const shiftId = newId();
  const counted = counts.filter((count) => count.pieces > 0);
  const openingCash = moneyToWire(countedTotal(counted));
  const denominations = counted.map((count) => ({
    denomination: moneyToWire(count.denomination),
    pieces: count.pieces,
  }));
  const payload = { shiftId, openingCash, denominations };
  return tillCommand(place, "shift.open", openShiftPayloadSchema, payload, at, {
    entity: "shift",
    entityId: shiftId,
    optimistic: {
      id: shiftId,
      branchId: place.branchId,
      deviceId: place.deviceId,
      status: "open",
      businessDate: businessDateAt(place, at),
      version: 1,
      openedByStaffId: staffId,
      openingDenominations: denominations,
      figures: {
        openingCash,
        cashSales: 0,
        cashRefunds: 0,
        cashIn: 0,
        cashOut: 0,
        expectedCash: openingCash,
      },
      close: null,
      cashRecordedAfterClose: 0,
    },
  });
}
