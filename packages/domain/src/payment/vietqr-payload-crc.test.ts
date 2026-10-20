import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { buildVietQrPayload } from "./build-vietqr-payload";
import { crc16CcittFalse, crc16Hex } from "./crc16-ccitt-false";
import { parseVietQrPayload } from "./parse-vietqr-payload";

// Published by the vietnam-qr-pay library as a dynamic and a static VietQR into ACB
// account 257678859; their checksums were confirmed with an independent implementation.
const PUBLISHED_DYNAMIC =
  "00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA" +
  "5303704540410005802VN62150811Chuyen tien6304BBB8";
const PUBLISHED_STATIC =
  "00020101021138530010A0000007270123000697041601092576788590208QRIBFTTA53037045802VN6304AE9F";

describe("CRC-16/CCITT-FALSE", () => {
  it("gives the standard check value 0x29B1 for 123456789", () => {
    expect(crc16CcittFalse("123456789")).toBe(0x29b1);
  });

  it("starts from 0xFFFF, which an empty text keeps", () => {
    expect(crc16CcittFalse("")).toBe(0xffff);
  });

  it("is written as four uppercase hex digits, leading zeros kept", () => {
    expect(crc16Hex("123456789")).toBe("29B1");
    expect(crc16Hex("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("buildVietQrPayload", () => {
  it("builds the very payload a published VietQR shows for the same transfer", () => {
    const payload = buildVietQrPayload({
      bankBin: "970416",
      accountNumber: "257678859",
      amount: vnd(1000),
      content: "Chuyen tien",
    });
    expect(payload).toBe(PUBLISHED_DYNAMIC);
  });

  it("asks for the amount as a one-time QR (initiation 12) in đồng from Vietnam", () => {
    const payload = buildVietQrPayload({
      bankBin: "970436",
      accountNumber: "0011001234567",
      amount: vnd(39_000),
      content: "FNB7K2M9QXA",
    });
    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("5303704");
    expect(payload).toContain("540539000");
    expect(payload).toContain("5802VN");
    expect(payload).toContain("62150811FNB7K2M9QXA");
  });

  it("names the merchant only when asked to", () => {
    const base = { bankBin: "970416", accountNumber: "257678859", amount: vnd(1000) };
    const named = buildVietQrPayload({ ...base, content: "Ban 3", merchantName: "PHO SANG" });
    expect(named).toContain("5908PHO SANG");
    expect(buildVietQrPayload({ ...base, content: "Ban 3" })).not.toContain("5908");
  });
});

describe("parseVietQrPayload", () => {
  it("reads the published dynamic QR back to its account, amount and content", () => {
    expect(parseVietQrPayload(PUBLISHED_DYNAMIC)).toEqual({
      initiation: "dynamic",
      bankBin: "970416",
      accountNumber: "257678859",
      amount: 1000n,
      content: "Chuyen tien",
      merchantName: null,
    });
  });

  it("reads a static QR, which carries no amount and no content", () => {
    expect(parseVietQrPayload(PUBLISHED_STATIC)).toMatchObject({
      initiation: "static",
      amount: null,
      content: null,
    });
  });

  it("reads back what it built, merchant name included", () => {
    const transfer = {
      bankBin: "970422",
      accountNumber: "VQR0123456789",
      amount: vnd(125_500),
      content: "FNB0ABCDEFG",
      merchantName: "TRA SUA BA TU",
    };
    expect(parseVietQrPayload(buildVietQrPayload(transfer))).toEqual({
      ...transfer,
      initiation: "dynamic",
    });
  });

  it("accepts a checksum written in lowercase hex", () => {
    expect(parseVietQrPayload(PUBLISHED_DYNAMIC.replace(/BBB8$/, "bbb8")).amount).toBe(1000n);
  });
});
