import type { EntitySnapshot } from "@fnb/contracts";
import { type ShiftCashSummary, type Vnd, vnd } from "@fnb/domain";

/** The till's shift as its copy shows it: the server's figures, or the till's expectation. */
export interface StoredShift {
  readonly id: string;
  readonly deviceId: string;
  readonly status: string;
  readonly businessDate: string;
  readonly version: number;
  readonly openedByStaffId: string;
  readonly figures: ShiftCashSummary;
  readonly close: { readonly countedCash: Vnd; readonly difference: Vnd } | null;
  /** The row as it came, for the till's next expectation of it. */
  readonly row: EntitySnapshot;
}

const FIGURES = ["openingCash", "cashSales", "cashRefunds", "cashIn", "cashOut", "expectedCash"];

function amount(from: Record<string, unknown>, key: string): Vnd {
  const value = from[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(key);
  return vnd(value);
}

/** The shift row, or null when it is not one the till can read (a foreign or old shape). */
export function readStoredShift(row: EntitySnapshot): StoredShift | null {
  try {
    const { id, deviceId, status, businessDate, version, openedByStaffId } = row;
    const figures = row.figures as Record<string, unknown> | null | undefined;
    if (
      typeof id !== "string" ||
      typeof deviceId !== "string" ||
      typeof status !== "string" ||
      typeof businessDate !== "string" ||
      typeof version !== "number" ||
      typeof openedByStaffId !== "string" ||
      typeof figures !== "object" ||
      figures === null
    ) {
      return null;
    }
    const read = Object.fromEntries(FIGURES.map((key) => [key, amount(figures, key)]));
    const close = row.close as Record<string, unknown> | null | undefined;
    return {
      id,
      deviceId,
      status,
      businessDate,
      version,
      openedByStaffId,
      figures: read as unknown as ShiftCashSummary,
      close:
        close === null || close === undefined
          ? null
          : { countedCash: amount(close, "countedCash"), difference: amount(close, "difference") },
      row,
    };
  } catch {
    return null;
  }
}
