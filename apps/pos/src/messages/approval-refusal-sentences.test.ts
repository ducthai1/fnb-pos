import { describe, expect, it } from "vitest";
// The server's own lists, so a code added there without a sentence here fails this test.
import { APPROVAL_ERROR_CODES } from "../../../api/src/permissions/permission-error-codes";
import { SYNC_ERROR_CODES } from "../../../api/src/sync/sync-error-codes";
import { percentOf } from "./vi-approval";
import { messageForCode, vi } from "./vi";

const SYNC_APPROVAL_CODES = Object.values(SYNC_ERROR_CODES).filter(
  (code) => code.startsWith("SYNC_APPROVAL_") || code === "SYNC_PERMISSION_DENIED",
);
const CODES = [...Object.values(APPROVAL_ERROR_CODES), ...SYNC_APPROVAL_CODES];

describe("what the till says when an approval is refused", () => {
  it.each(CODES)("says what %s means in its own sentence", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown);
  });

  it("gives each code a different sentence", () => {
    const sentences = CODES.map(messageForCode);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it.each(SYNC_APPROVAL_CODES.filter((code) => code !== "SYNC_PERMISSION_DENIED"))(
    "tells the cashier to do %s again with a fresh approval",
    (code) => {
      expect(messageForCode(code)).toMatch(/duyệt lại|nhập PIN/);
    },
  );

  it("reads rates as a person says them", () => {
    expect(percentOf(2000)).toBe("20%");
    expect(percentOf(1250)).toBe("12,5%");
    expect(percentOf(1)).toBe("0,01%");
    expect(percentOf(10_000)).toBe("100%");
  });
});
