import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { type JsonRecord, isRecord, listOf, nullableTextOf, textOf, wholeNumberOf } from "./read-json-fields";

/** An order of the day as a manager finds it on the till: which till, which number. */
export interface DayOrder {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceOrderNo: number;
}

export interface DayInvoice {
  readonly id: string;
  readonly orderId: string;
  readonly status: string;
  readonly attempts: number;
  readonly lastErrorCode: string | null;
}

/** QR money handed back once the day was closed: listed beside the day, not in it. */
export interface DayQrRefund {
  readonly intentId: string;
  readonly amount: number;
}

/** A shift of the day still open: which till, what its drawer should hold, at which version. */
export interface DayOpenShift {
  readonly id: string;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
  /** Its till can no longer sign in: a manager closes it on the till's behalf. */
  readonly deviceRevoked: boolean;
  readonly openedAt: string;
  readonly version: number;
  readonly expectedCash: number;
}

/** A shift of the day a manager closed for its revoked till, with cash the till sent after. */
export interface DayShiftClosedOnBehalf {
  readonly id: string;
  readonly deviceName: string | null;
  readonly closedAt: string;
  readonly countedCash: number;
  readonly expectedCash: number;
  readonly difference: number;
  readonly cashAfterClose: number;
}

/** A closed shift of the day whose sales' cash came in after its close. */
export interface DayShiftCashAfterClose {
  readonly id: string;
  readonly deviceName: string | null;
  readonly amount: number;
}

/** What a close on a revoked till's behalf settled. */
export interface ShiftClosedOnBehalf {
  readonly shiftId: string;
  readonly countedCash: number;
  readonly expectedCash: number;
  readonly difference: number;
}

export interface ClosedDay {
  readonly closedByAppUserId: string;
  readonly closedAt: string;
}

/** Where a business day stands: what stops it closing, and what needs a person after. */
export interface DayStatus {
  readonly dayClose: ClosedDay | null;
  readonly openShiftIds: readonly string[];
  readonly openDrafts: readonly DayOrder[];
  readonly paidAfterClose: readonly DayOrder[];
  readonly qrRefundedAfterClose: readonly DayQrRefund[];
  readonly unissuedInvoices: readonly DayInvoice[];
  readonly failedInvoices: readonly DayInvoice[];
  readonly unsentInvoices: readonly DayInvoice[];
  readonly openShifts: readonly DayOpenShift[];
  readonly closedOnBehalf: readonly DayShiftClosedOnBehalf[];
  readonly cashAfterShiftClose: readonly DayShiftCashAfterClose[];
}

export function readDayOrder(item: JsonRecord): DayOrder | null {
  const id = textOf(item, "id");
  const deviceId = textOf(item, "deviceId");
  const deviceOrderNo = wholeNumberOf(item, "deviceOrderNo");
  return id === null || deviceId === null || deviceOrderNo === null ? null : { id, deviceId, deviceOrderNo };
}

export function readDayInvoice(item: JsonRecord): DayInvoice | null {
  const id = textOf(item, "id");
  const orderId = textOf(item, "orderId");
  const status = textOf(item, "status");
  const attempts = wholeNumberOf(item, "attempts");
  const lastErrorCode = nullableTextOf(item, "lastErrorCode");
  if (id === null || orderId === null || status === null || attempts === null || lastErrorCode === undefined) return null;
  return { id, orderId, status, attempts, lastErrorCode };
}

function readDayQrRefund(item: JsonRecord): DayQrRefund | null {
  const intentId = textOf(item, "intentId");
  const amount = wholeNumberOf(item, "amount");
  return intentId === null || amount === null ? null : { intentId, amount };
}

/** A whole number of đồng, signed (a difference may be short). */
function amountOf(item: JsonRecord, key: string): number | null {
  const value = item[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function readDayOpenShift(item: JsonRecord): DayOpenShift | null {
  const id = textOf(item, "id");
  const deviceId = nullableTextOf(item, "deviceId");
  const deviceName = nullableTextOf(item, "deviceName");
  const openedAt = textOf(item, "openedAt");
  const version = wholeNumberOf(item, "version");
  const expectedCash = amountOf(item, "expectedCash");
  const deviceRevoked = item.deviceRevoked;
  if (id === null || deviceId === undefined || deviceName === undefined || openedAt === null) return null;
  if (version === null || expectedCash === null || typeof deviceRevoked !== "boolean") return null;
  return { id, deviceId, deviceName, deviceRevoked, openedAt, version, expectedCash };
}

function readClosedOnBehalf(item: JsonRecord): DayShiftClosedOnBehalf | null {
  const id = textOf(item, "id");
  const deviceName = nullableTextOf(item, "deviceName");
  const closedAt = textOf(item, "closedAt");
  const amounts = (["countedCash", "expectedCash", "difference", "cashAfterClose"] as const).map((key) =>
    amountOf(item, key),
  );
  const [countedCash, expectedCash, difference, cashAfterClose] = amounts;
  if (id === null || deviceName === undefined || closedAt === null) return null;
  if (countedCash == null || expectedCash == null || difference == null || cashAfterClose == null) return null;
  return { id, deviceName, closedAt, countedCash, expectedCash, difference, cashAfterClose };
}

function readCashAfterShiftClose(item: JsonRecord): DayShiftCashAfterClose | null {
  const id = textOf(item, "id");
  const deviceName = nullableTextOf(item, "deviceName");
  const amount = amountOf(item, "amount");
  return id === null || deviceName === undefined || amount === null ? null : { id, deviceName, amount };
}

function readShiftClosedOnBehalf(body: unknown): ShiftClosedOnBehalf | null {
  if (!isRecord(body)) return null;
  const shiftId = textOf(body, "shiftId");
  const countedCash = amountOf(body, "countedCash");
  const expectedCash = amountOf(body, "expectedCash");
  const difference = amountOf(body, "difference");
  if (shiftId === null || countedCash === null || expectedCash === null || difference === null) return null;
  return { shiftId, countedCash, expectedCash, difference };
}

const readShiftId = (value: unknown) => (typeof value === "string" ? value : null);

/** The ids of a list of plain strings, or null when any is not one. */
export function readIds(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const ids = list.map(readShiftId);
  return ids.every((id): id is string => id !== null) ? ids : null;
}

function readClosedDay(value: unknown): ClosedDay | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const closedByAppUserId = textOf(value, "closedByAppUserId");
  const closedAt = textOf(value, "closedAt");
  return closedByAppUserId === null || closedAt === null ? undefined : { closedByAppUserId, closedAt };
}

function readDayStatus(body: unknown): DayStatus | null {
  if (!isRecord(body)) return null;
  const dayClose = readClosedDay(body.dayClose);
  const openShiftIds = readIds(body.openShiftIds);
  const openDrafts = listOf(body.openDrafts, readDayOrder);
  const paidAfterClose = listOf(body.paidAfterClose, readDayOrder);
  // An older API sends no such list: nothing was handed back after its closes then.
  const qrRefundedAfterClose = listOf(body.qrRefundedAfterClose ?? [], readDayQrRefund);
  const unissuedInvoices = listOf(body.unissuedInvoices, readDayInvoice);
  const failedInvoices = listOf(body.failedInvoices, readDayInvoice);
  const unsentInvoices = listOf(body.unsentInvoices, readDayInvoice);
  if (dayClose === undefined || openShiftIds === null || openDrafts === null || paidAfterClose === null) return null;
  if (unissuedInvoices === null || failedInvoices === null || unsentInvoices === null) return null;
  if (qrRefundedAfterClose === null) return null;
  // An older API sends none of the shift lists: its open shifts are only ids then.
  const openShifts = listOf(body.openShifts ?? [], readDayOpenShift);
  const closedOnBehalf = listOf(body.closedOnBehalf ?? [], readClosedOnBehalf);
  const cashAfterShiftClose = listOf(body.cashAfterShiftClose ?? [], readCashAfterShiftClose);
  if (openShifts === null || closedOnBehalf === null || cashAfterShiftClose === null) return null;
  const lists = { paidAfterClose, qrRefundedAfterClose, unissuedInvoices, failedInvoices, unsentInvoices };
  const shifts = { openShifts, closedOnBehalf, cashAfterShiftClose };
  return { dayClose, openShiftIds, openDrafts, ...lists, ...shifts };
}

export interface DayCloseApi {
  /** `GET /branches/:branchId/day-close?businessDate=`: the close, if any, and what is open. */
  getDayStatus(branchId: string, businessDate: string): Promise<ApiResult<DayStatus>>;
  /**
   * `POST /branches/:branchId/day-close` `{ businessDate }`: 201 with the close and the day
   * after it; refused 409 with what is still open (shiftIds, drafts or invoices).
   */
  closeDay(branchId: string, businessDate: string): Promise<ApiResult<DayStatus>>;
  /**
   * `POST /shifts/:shiftId/close-on-behalf` `{ countedCash, version }`: a revoked till's shift
   * closed on the manager's count, against the version the manager read.
   */
  closeShiftOnBehalf(shiftId: string, countedCash: number, version: number): Promise<ApiResult<ShiftClosedOnBehalf>>;
}

export function httpDayCloseApi(base: string, fetchImpl: FetchLike): DayCloseApi {
  const url = (branchId: string) => `${base}/branches/${encodeURIComponent(branchId)}/day-close`;
  return {
    async getDayStatus(branchId, businessDate) {
      const query = new URLSearchParams({ businessDate });
      const answer = await requestJson(fetchImpl, `${url(branchId)}?${query}`, { method: "GET" });
      return resultOf(answer, readDayStatus);
    },
    async closeDay(branchId, businessDate) {
      const answer = await requestJson(fetchImpl, url(branchId), { method: "POST", body: { businessDate } });
      return resultOf(answer, readDayStatus);
    },
    async closeShiftOnBehalf(shiftId, countedCash, version) {
      const answer = await requestJson(fetchImpl, `${base}/shifts/${encodeURIComponent(shiftId)}/close-on-behalf`, {
        method: "POST",
        body: { countedCash, version },
      });
      return resultOf(answer, readShiftClosedOnBehalf);
    },
  };
}
