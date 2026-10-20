import { SYNC_ORDER_VERSION_ERROR_CODES } from "@fnb/contracts";
import { ORDER_ERROR_CODES } from "@fnb/domain";
import { describe, expect, it } from "vitest";
// The server's own list, so a table code added there without a sentence here fails this test.
import { TABLE_SYNC_ERROR_CODES } from "../../../api/src/sync/table-sync-error-codes";
import { messageForCode, refusalSentence, vi } from "./vi";

const TABLE_CODES = Object.values(TABLE_SYNC_ERROR_CODES);
/** What a table's order meets when another till got there first or closed it. */
const ORDER_CODES = [
  SYNC_ORDER_VERSION_ERROR_CODES.orderVersionStale,
  "SYNC_LINE_LOCKED",
  "SYNC_DEVICE_ORDER_NO_TAKEN",
  "SYNC_APPROVAL_REQUIRED",
  "SYNC_PERMISSION_DENIED",
  ORDER_ERROR_CODES.alreadyPaid,
  ORDER_ERROR_CODES.alreadyCancelled,
  ORDER_ERROR_CODES.alreadyPosted,
];

describe("what the till says when the server refuses a command about a table", () => {
  it.each([...TABLE_CODES, ...ORDER_CODES])("says what %s means and what to do", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown);
    expect(refusalSentence("order.save_draft", code)).toBe(messageForCode(code));
  });

  it("gives each code a sentence of its own", () => {
    const sentences = [...TABLE_CODES, ...ORDER_CODES].map(messageForCode);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("tells a refused move apart from a refused opening of the same occupied table", () => {
    const opening = refusalSentence("order.save_draft", "SYNC_TABLE_OCCUPIED");
    const moving = refusalSentence("table.transfer", "SYNC_TABLE_OCCUPIED");
    expect(opening).toBe(vi.errors.SYNC_TABLE_OCCUPIED);
    expect(moving).not.toBe(opening);
    expect(moving).not.toBe(vi.errors.unknown);
    expect(refusalSentence("table.transfer", "SYNC_APPROVAL_REQUIRED")).not.toBe(
      vi.errors.SYNC_APPROVAL_REQUIRED,
    );
  });

  it("keeps the general sentence for a code with nothing special to say about the move", () => {
    expect(refusalSentence("table.transfer", "SYNC_TABLE_ARCHIVED")).toBe(
      vi.errors.SYNC_TABLE_ARCHIVED,
    );
    expect(refusalSentence("table.transfer", "SYNC_SOMETHING_NEW")).toBe(vi.errors.unknown);
  });
});
