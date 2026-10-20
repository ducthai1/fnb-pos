import { PAYMENT_GATEWAYS } from "@fnb/api/payment-gateways";
import { describe, expect, it } from "vitest";
import { readNoticeArguments, sepayDevNotice } from "./sepay-dev-notice";

const sepay = PAYMENT_GATEWAYS.find((gateway) => gateway.gateway === "sepay");
if (sepay === undefined) throw new Error("the API has no SePay adapter");

const notice = sepayDevNotice({
  tenantId: "0192f0a0-0000-7000-8000-000000000001",
  secret: "sepay-dev-key-for-tests",
  content: "FNB7K2M9QXA",
  amount: 64_000,
  at: new Date("2026-10-20T17:30:05Z"),
  transactionId: 9_001,
});
const asReceived = (headers: Record<string, string>) => ({ headers, body: notice.body });

describe("the development SePay notice", () => {
  it("is signed the way the server's SePay adapter checks", () => {
    expect(sepay.verify(asReceived({ ...notice.headers }), "sepay-dev-key-for-tests")).toBe(true);
  });

  it("does not pass with another branch's key", () => {
    expect(sepay.verify(asReceived({ ...notice.headers }), "another-branch-key")).toBe(false);
  });

  it("reads as the transfer it describes, at the moment given", () => {
    expect(sepay.parse(asReceived({ ...notice.headers }))).toEqual({
      referenceCode: "9001",
      amount: 64_000n,
      content: "FNB7K2M9QXA",
      transferType: "in",
      occurredAt: new Date("2026-10-20T17:30:05Z"),
    });
    expect(notice.path).toBe("/webhooks/payments/sepay/0192f0a0-0000-7000-8000-000000000001");
  });
});

describe("the command line of dev:bank-notice", () => {
  it("takes a content code and a whole amount", () => {
    expect(readNoticeArguments(["FNB7K2M9QXA", "64000"])).toEqual({
      ok: true,
      content: "FNB7K2M9QXA",
      amount: 64_000,
    });
  });

  it.each([
    [[]],
    [["FNB7K2M9QXA"]],
    [["FNB7K2M9QXA", "64.5"]],
    [["FNB7K2M9QXA", "-1"]],
    [["", "1"]],
  ])("refuses %j", (args) => {
    expect(readNoticeArguments(args)).toEqual({ ok: false });
  });
});
