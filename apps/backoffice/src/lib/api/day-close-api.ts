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
  const lists = { paidAfterClose, qrRefundedAfterClose, unissuedInvoices, failedInvoices, unsentInvoices };
  return { dayClose, openShiftIds, openDrafts, ...lists };
}

export interface DayCloseApi {
  /** `GET /branches/:branchId/day-close?businessDate=`: the close, if any, and what is open. */
  getDayStatus(branchId: string, businessDate: string): Promise<ApiResult<DayStatus>>;
  /**
   * `POST /branches/:branchId/day-close` `{ businessDate }`: 201 with the close and the day
   * after it; refused 409 with what is still open (shiftIds, drafts or invoices).
   */
  closeDay(branchId: string, businessDate: string): Promise<ApiResult<DayStatus>>;
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
  };
}
