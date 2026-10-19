import { vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { renderEscPosChunks } from "../render/render-escpos";
import { renderPreview } from "../render/render-preview";
import { chunksAsHex, expectGolden } from "../test-support/golden-file";
import { cp1258Printer } from "../test-support/print-profiles";
import { EVENING_SHIFT } from "../test-support/template-fixtures";
import { buildShiftClose } from "./shift-close-template";

describe("shift close slip", () => {
  it("prints a shift close on 58mm as in its golden files", () => {
    const slip = buildShiftClose(EVENING_SHIFT);
    expectGolden("shift-close-58mm.txt", renderPreview(slip, "58mm"));
    expectGolden(
      "shift-close-58mm.hex",
      chunksAsHex(renderEscPosChunks(slip, cp1258Printer("58mm"))),
    );
  });

  it("signs each difference: short is minus, over is plus, even is zero", () => {
    const preview = renderPreview(buildShiftClose(EVENING_SHIFT), "80mm");
    expect(preview).toMatch(/Chênh lệch +-50\.000/);
    expect(preview).toMatch(/Chênh lệch +\+20\.000/);
    expect(preview).toMatch(/Chênh lệch +0\u00a0₫/);
  });

  it("gives an uncounted method no difference and keeps it out of the total difference", () => {
    const preview = renderPreview(buildShiftClose(EVENING_SHIFT), "80mm");
    expect(preview).toMatch(/Thực tế +chưa đếm/);
    expect(preview.match(/Chênh lệch /g)).toHaveLength(3);
    expect(preview).toMatch(/Tổng chênh lệch +-30\.000/);
    expect(preview).toMatch(/Tổng hệ thống +9\.970\.000/);
  });

  it("totals the difference from the counted amounts, not from the slip's own numbers", () => {
    const counted = EVENING_SHIFT.methods.map((m) => ({ ...m, counted: m.expected }));
    const even = renderPreview(buildShiftClose({ ...EVENING_SHIFT, methods: counted }), "80mm");
    expect(even).toMatch(/Tổng chênh lệch +0\u00a0₫/);
    const over = [{ method: "Tiền mặt", expected: vnd(0), counted: vnd(1) }];
    const one = renderPreview(buildShiftClose({ ...EVENING_SHIFT, methods: over }), "80mm");
    expect(one).toMatch(/Tổng chênh lệch +\+1\u00a0₫/);
  });
});
