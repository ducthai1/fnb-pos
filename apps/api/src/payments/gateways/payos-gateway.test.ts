import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UnreadableNoticeError } from "./payment-gateway-adapter";
import { payosGateway, payosSignedText } from "./payos-gateway";

const CHECKSUM_KEY = "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675";

// The data object of payOS's documented webhook example.
const DATA = {
  orderCode: 123,
  amount: 3000,
  description: "VQRIO123",
  accountNumber: "12345678",
  reference: "TF230204212323",
  transactionDateTime: "2023-02-04 18:25:00",
  currency: "VND",
  paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
  code: "00",
  desc: "Thành công",
  counterAccountBankId: "",
  counterAccountBankName: "",
  counterAccountName: "",
  counterAccountNumber: "",
  virtualAccountName: "",
  virtualAccountNumber: "",
};

// Written out by hand from payOS's rule: keys in alphabetical order, key=value, joined by &.
const SIGNED_TEXT =
  "accountNumber=12345678&amount=3000&code=00&counterAccountBankId=&counterAccountBankName=" +
  "&counterAccountName=&counterAccountNumber=&currency=VND&desc=Thành công" +
  "&description=VQRIO123&orderCode=123&paymentLinkId=124c33293c43417ab7879e14c8d9eb18" +
  "&reference=TF230204212323&transactionDateTime=2023-02-04 18:25:00" +
  "&virtualAccountName=&virtualAccountNumber=";

const sign = (text: string, key = CHECKSUM_KEY) =>
  createHmac("sha256", key).update(text, "utf8").digest("hex");
const notice = (data: object, signature: string) => ({
  headers: {},
  body: { code: "00", desc: "success", success: true, data, signature },
});

describe("payosSignedText", () => {
  it("sorts the data by key and joins key=value pairs with &", () => {
    expect(payosSignedText(DATA)).toBe(SIGNED_TEXT);
  });

  it("writes null and its spellings as nothing, leaves out undefined, and arrays as JSON", () => {
    expect(payosSignedText({ b: null, a: "null", c: undefined, d: "undefined" })).toBe("a=&b=&d=");
    expect(payosSignedText({ items: [{ quantity: 1, name: "Trà" }] })).toBe(
      'items=[{"name":"Trà","quantity":1}]',
    );
  });
});

describe("payosGateway.verify", () => {
  it("takes data signed with the channel's checksum key", () => {
    expect(payosGateway.verify(notice(DATA, sign(SIGNED_TEXT)), CHECKSUM_KEY)).toBe(true);
  });

  it.each([
    ["an amount changed after signing", { ...DATA, amount: 300000 }, sign(SIGNED_TEXT)],
    ["a signature by another key", DATA, sign(SIGNED_TEXT, "another-checksum-key")],
    ["no signature", DATA, ""],
  ])("refuses %s", (_case, data, signature) => {
    expect(payosGateway.verify(notice(data, signature), CHECKSUM_KEY)).toBe(false);
  });

  it("refuses a body that is not a signed notice at all", () => {
    expect(payosGateway.verify({ headers: {}, body: "x" }, CHECKSUM_KEY)).toBe(false);
  });
});

describe("payosGateway.parse", () => {
  it("reads money received, keyed by the bank's reference, at Vietnam's time", () => {
    expect(payosGateway.parse(notice(DATA, ""))).toEqual({
      referenceCode: "TF230204212323",
      amount: 3000n,
      content: "VQRIO123",
      transferType: "in",
      occurredAt: new Date("2023-02-04T11:25:00.000Z"),
    });
  });

  it("reports no transfer for a notice of a payment that did not go through", () => {
    expect(payosGateway.parse(notice({ ...DATA, code: "01" }, ""))).toBeNull();
  });

  it("refuses a notice without the bank's reference", () => {
    expect(() => payosGateway.parse(notice({ ...DATA, reference: "" }, ""))).toThrow(
      UnreadableNoticeError,
    );
  });
});
