import { type DailySalesReport, dailySalesReportSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { type JsonRecord, isRecord, listOf, nullableTextOf, parsedBy, textOf, wholeNumberOf } from "./read-json-fields";

export type { DailySalesReport };

/** A slip a till could not print and has not printed since. */
export interface PrintFailure {
  readonly jobId: string;
  readonly kind: string;
  readonly printerKey: string;
  readonly attempts: number;
  readonly errorCode: string;
  readonly occurredAt: string;
  readonly deviceId: string;
  readonly staffId: string;
  readonly orderId: string | null;
  readonly deviceOrderNo: number | null;
  readonly callNumber: string | null;
  readonly shiftId: string | null;
}

export interface PrintFailures {
  readonly failures: readonly PrintFailure[];
  /** More failed than one answer lists: the list shows the newest only. */
  readonly truncated: boolean;
}

function readPrintFailure(item: JsonRecord): PrintFailure | null {
  const texts = ["jobId", "kind", "printerKey", "errorCode", "occurredAt", "deviceId", "staffId"] as const;
  const read = Object.fromEntries(texts.map((key) => [key, textOf(item, key)]));
  if (texts.some((key) => read[key] === null)) return null;
  const attempts = wholeNumberOf(item, "attempts");
  const orderId = nullableTextOf(item, "orderId");
  const callNumber = nullableTextOf(item, "callNumber");
  const shiftId = nullableTextOf(item, "shiftId");
  const orderNo = item.deviceOrderNo === null ? null : wholeNumberOf(item, "deviceOrderNo");
  if (attempts === null || orderId === undefined || callNumber === undefined || shiftId === undefined) return null;
  if (orderNo === null && item.deviceOrderNo !== null) return null;
  return {
    ...(read as Record<(typeof texts)[number], string>),
    attempts,
    orderId,
    deviceOrderNo: orderNo,
    callNumber,
    shiftId,
  };
}

function readPrintFailures(body: unknown): PrintFailures | null {
  if (!isRecord(body) || typeof body.truncated !== "boolean") return null;
  const failures = listOf(body.failures, readPrintFailure);
  return failures === null ? null : { failures, truncated: body.truncated };
}

export interface ReportsApi {
  /** `GET /reports/daily-sales?branchId=&businessDate=`: the day's figures by fixed definitions. */
  getDailySales(branchId: string, businessDate: string): Promise<ApiResult<DailySalesReport>>;
  /** `GET /reports/print-failures?branchId=&from=&to=`: slips still missing, newest first. */
  getPrintFailures(branchId: string, from: string, to: string): Promise<ApiResult<PrintFailures>>;
}

export function httpReportsApi(base: string, fetchImpl: FetchLike): ReportsApi {
  return {
    async getDailySales(branchId, businessDate) {
      const query = new URLSearchParams({ branchId, businessDate });
      const answer = await requestJson(fetchImpl, `${base}/reports/daily-sales?${query}`, { method: "GET" });
      return resultOf(answer, (body) => parsedBy(dailySalesReportSchema, body));
    },
    async getPrintFailures(branchId, from, to) {
      const query = new URLSearchParams({ branchId, from, to });
      const answer = await requestJson(fetchImpl, `${base}/reports/print-failures?${query}`, { method: "GET" });
      return resultOf(answer, readPrintFailures);
    },
  };
}
