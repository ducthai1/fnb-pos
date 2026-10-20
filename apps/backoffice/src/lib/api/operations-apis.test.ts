import { describe, expect, it } from "vitest";
import { TABLE_1, TERRACE } from "../../test-support/fake-floor";
import { dailySalesReport, dayStatus, fixtureId, unmatchedPayments } from "../../test-support/fake-reports-and-day";
import { dayCloseBlockersOf } from "../day-close/day-close-refusal";
import type { ApiFailure } from "./api-result";
import { httpDayCloseApi } from "./day-close-api";
import { httpFloorApi } from "./floor-api";
import { httpPaymentsApi } from "./payments-api";
import { httpReportsApi } from "./reports-api";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch answering every call with `status` and `body`, recording what was asked. */
function answering(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

const BRANCH = fixtureId(1);
const PRINT_FAILURE = {
  jobId: fixtureId(2),
  kind: "bill",
  printerKey: "quay",
  attempts: 2,
  errorCode: "PRINTER_OFFLINE",
  occurredAt: "2026-10-20T03:00:00.000Z",
  deviceId: fixtureId(3),
  staffId: fixtureId(4),
  orderId: null,
  deviceOrderNo: null,
  callNumber: null,
  shiftId: fixtureId(5),
};

describe("the report calls", () => {
  it("read the day's sales by the contract, and print failures field by field", async () => {
    const sales = answering(200, dailySalesReport());
    expect((await httpReportsApi("/api", sales.fetchImpl).getDailySales(BRANCH, "2026-10-20")).ok).toBe(true);
    expect(sales.calls[0]!.url).toBe(`/api/reports/daily-sales?branchId=${BRANCH}&businessDate=2026-10-20`);
    const prints = answering(200, { failures: [PRINT_FAILURE], truncated: true });
    const read = await httpReportsApi("/api", prints.fetchImpl).getPrintFailures(BRANCH, "a", "b");
    expect(read).toEqual({ ok: true, value: { failures: [PRINT_FAILURE], truncated: true } });
  });

  it.each([
    ["a figure nobody defined", answering(200, { ...dailySalesReport(), tips: 0 })],
    ["a failure without its printer", answering(200, { failures: [{ ...PRINT_FAILURE, printerKey: null }], truncated: false })],
    ["no word on truncation", answering(200, { failures: [] })],
  ])("treat an answer with %s as a failed call", async (_case, server) => {
    const api = httpReportsApi("/api", server.fetchImpl);
    const result = _case.startsWith("a figure") ? await api.getDailySales(BRANCH, "2026-10-20") : await api.getPrintFailures(BRANCH, "a", "b");
    expect(result.ok).toBe(false);
  });
});

describe("the day close calls", () => {
  it("read where a day stands and close it by its business date", async () => {
    const server = answering(200, { ...dayStatus({ openShiftIds: [fixtureId(6)] }), batches: [] });
    const api = httpDayCloseApi("/api", server.fetchImpl);
    expect(await api.getDayStatus(BRANCH, "2026-10-20")).toMatchObject({ ok: true, value: { openShiftIds: [fixtureId(6)] } });
    await api.closeDay(BRANCH, "2026-10-20");
    expect(server.calls).toEqual([
      { url: `/api/branches/${BRANCH}/day-close?businessDate=2026-10-20`, method: "GET", body: undefined },
      { url: `/api/branches/${BRANCH}/day-close`, method: "POST", body: { businessDate: "2026-10-20" } },
    ]);
  });

  it("read the list a refused close carries, and nothing from other refusals", () => {
    const refusal = (status: number, code: string, details: object): ApiFailure => ({ ok: false, status, code, body: { code, ...details } });
    expect(dayCloseBlockersOf(refusal(409, "API_DAY_CLOSE_SHIFTS_OPEN", { shiftIds: [fixtureId(7)] }))).toEqual({
      kind: "shifts",
      shiftIds: [fixtureId(7)],
    });
    expect(dayCloseBlockersOf(refusal(409, "API_DAY_CLOSE_SHIFTS_OPEN", { shiftIds: [7] }))).toBeNull();
    expect(dayCloseBlockersOf(refusal(409, "API_DAY_ALREADY_CLOSED", {}))).toBeNull();
    expect(dayCloseBlockersOf(refusal(404, "API_DAY_CLOSE_DRAFTS_OPEN", { drafts: [] }))).toBeNull();
  });
});

describe("the transfer calls", () => {
  it("list the branch's unmatched money and match one transfer to one QR", async () => {
    const payments = unmatchedPayments();
    const list = answering(200, payments);
    expect(await httpPaymentsApi("/api", list.fetchImpl).listUnmatched(BRANCH)).toEqual({ ok: true, value: payments });
    expect(list.calls[0]!.url).toBe(`/api/payments/unmatched?branchId=${BRANCH}`);
    const intent = { ...payments.openIntents[0]!, status: "paid", receivedAmount: 35_000 };
    const match = answering(200, { intent });
    expect(await httpPaymentsApi("/api", match.fetchImpl).matchTransfer(fixtureId(8), intent.id)).toEqual({ ok: true, value: intent });
    expect(match.calls[0]).toEqual({ url: "/api/payments/match", method: "POST", body: { transactionId: fixtureId(8), intentId: intent.id } });
  });
});

describe("the floor calls", () => {
  it("list, write and remove areas and tables of a branch", async () => {
    const areas = answering(200, [TERRACE]);
    expect(await httpFloorApi("/api", areas.fetchImpl).listAreas(BRANCH)).toEqual({ ok: true, value: [TERRACE] });
    expect(areas.calls[0]!.url).toBe(`/api/floor/areas?branchId=${BRANCH}`);
    const tables = answering(200, [TABLE_1]);
    expect(await httpFloorApi("/api", tables.fetchImpl).listTables(BRANCH)).toEqual({ ok: true, value: [TABLE_1] });
    const removed = answering(200, { id: TABLE_1.id, outcome: "archived" });
    expect(await httpFloorApi("/api", removed.fetchImpl).removeTable(TABLE_1.id)).toEqual({ ok: true, value: "archived" });
    expect(removed.calls[0]).toMatchObject({ url: `/api/floor/tables/${TABLE_1.id}`, method: "DELETE" });
  });

  it("treat a table of a shape the plan does not draw as a failed call", async () => {
    const odd = answering(200, [{ ...TABLE_1, shape: "hexagon" }]);
    expect((await httpFloorApi("/api", odd.fetchImpl).listTables(BRANCH)).ok).toBe(false);
  });
});
