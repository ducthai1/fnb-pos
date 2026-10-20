import { describe, expect, it } from "vitest";
import { UnreadableNoticeError } from "./payment-gateway-adapter";
import { sepayGateway } from "./sepay-gateway";

// The example notice of SePay's webhook documentation.
const DOCUMENTED = {
  id: 92704,
  gateway: "Vietcombank",
  transactionDate: "2023-03-25 14:02:37",
  accountNumber: "0123499999",
  code: null,
  content: "chuyen tien mua iphone",
  transferType: "in",
  transferAmount: 2277000,
  accumulated: 19077000,
  subAccount: null,
  referenceCode: "MBVCB.3278907687",
  description: "",
};

const notice = (headers: Record<string, string | string[]>, body: unknown = DOCUMENTED) => ({
  headers,
  body,
});

describe("sepayGateway.verify", () => {
  it("takes the API key the shop set, sent as Authorization: Apikey <key>", () => {
    expect(
      sepayGateway.verify(
        notice({ authorization: "Apikey k-0123456789abcdef" }),
        "k-0123456789abcdef",
      ),
    ).toBe(true);
  });

  it.each([
    ["no Authorization header", {}],
    ["another key", { authorization: "Apikey k-0123456789abcdeX" }],
    ["the key under another scheme", { authorization: "Bearer k-0123456789abcdef" }],
    ["the key alone", { authorization: "k-0123456789abcdef" }],
    ["the header sent twice", { authorization: ["Apikey k-0123456789abcdef", "x"] }],
  ])("refuses %s", (_case, headers) => {
    expect(sepayGateway.verify(notice(headers), "k-0123456789abcdef")).toBe(false);
  });
});

describe("sepayGateway.parse", () => {
  it("reads the documented notice, keyed by SePay's id, at Vietnam's time", () => {
    expect(sepayGateway.parse(notice({}))).toEqual({
      referenceCode: "92704",
      amount: 2277000n,
      content: "chuyen tien mua iphone",
      transferType: "in",
      occurredAt: new Date("2023-03-25T07:02:37.000Z"),
    });
  });

  it("reads money out, and a transfer with no content", () => {
    const out = { ...DOCUMENTED, transferType: "out", content: null };
    expect(sepayGateway.parse(notice({}, out))).toMatchObject({ transferType: "out", content: "" });
  });

  it.each([
    ["an amount with decimals", { transferAmount: 2277000.5 }],
    ["no amount", { transferAmount: undefined }],
    ["no id", { id: undefined }],
    ["a direction it does not describe", { transferType: "both" }],
    ["a time with an offset it does not use", { transactionDate: "2023-03-25T14:02:37Z" }],
  ])("refuses a notice with %s", (_case, change) => {
    expect(() => sepayGateway.parse(notice({}, { ...DOCUMENTED, ...change }))).toThrow(
      UnreadableNoticeError,
    );
  });
});
