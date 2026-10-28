import { quantity } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { PAPER_COLUMNS } from "../layout/print-document";
import { renderEscPosChunks } from "../render/render-escpos";
import { renderPreview } from "../render/render-preview";
import { chunksAsHex, expectGolden } from "../test-support/golden-file";
import { HOSTILE } from "../test-support/hostile-print-data";
import { lettersOf, overflowingLines } from "../test-support/preview-checks";
import { cp1258Printer } from "../test-support/print-profiles";
import { BAR_TICKET } from "../test-support/template-fixtures";
import { buildKitchenTicket } from "./kitchen-ticket-template";

const onlyKind = (kind: "new" | "cancel" | "note_changed") => ({
  ...BAR_TICKET,
  lines: BAR_TICKET.lines.filter((line) => line.kind === kind),
});

describe("kitchen and bar ticket", () => {
  it("prints a bar ticket on 80mm as in its golden files", () => {
    const ticket = buildKitchenTicket(BAR_TICKET);
    expectGolden("kitchen-bar-80mm.txt", renderPreview(ticket, "80mm"));
    expectGolden(
      "kitchen-bar-80mm.hex",
      chunksAsHex(renderEscPosChunks(ticket, cp1258Printer("80mm"))),
    );
  });

  it("prints a bar ticket on 58mm as in its golden file", () => {
    expectGolden("kitchen-bar-58mm.txt", renderPreview(buildKitchenTicket(BAR_TICKET), "58mm"));
  });

  it("lists cancels first, then note changes, then new items", () => {
    const preview = renderPreview(buildKitchenTicket(BAR_TICKET), "80mm");
    const cancel = preview.indexOf("*** HỦY MÓN ***");
    const note = preview.indexOf("ĐỔI GHI CHÚ");
    const fresh = preview.indexOf("MÓN MỚI");
    expect(cancel).toBeGreaterThan(-1);
    expect(cancel < note && note < fresh).toBe(true);
  });

  it("marks every cancelled line itself, and only those", () => {
    const preview = renderPreview(buildKitchenTicket(BAR_TICKET), "80mm");
    expect(preview).toContain("HỦY 1 x Cà phê sữa đá");
    expect(preview).not.toContain("HỦY 2 x Trà sữa");
    expect(preview).toContain("Cũ: Ít đá\n  Mới: Không đá");
  });

  it("writes a weighed item as the grams to make up, a counted one as its units", () => {
    const beans = {
      kind: "new",
      name: "Cà phê hạt Robusta",
      quantity: quantity("3.51"),
      grams: 351,
      note: null,
      previousNote: null,
      children: [],
    } as const;
    const ticket = { ...BAR_TICKET, lines: [...BAR_TICKET.lines, beans] };
    const preview = renderPreview(buildKitchenTicket(ticket), "58mm").replace(/\u00a0/g, " ");
    expect(preview).toContain("351 g x Cà phê hạt Robusta");
    expect(preview).not.toContain("3,51 x Cà phê hạt");
    expect(preview).toContain("2 x Trà sữa trân châu");
  });

  it("leaves out a section with nothing in it", () => {
    const preview = renderPreview(buildKitchenTicket(onlyKind("new")), "80mm");
    expect(preview).toContain("MÓN MỚI");
    expect(preview).not.toContain("HỦY");
    expect(preview).not.toContain("ĐỔI GHI CHÚ");
  });

  it("shows an empty previous note as such", () => {
    const changed = onlyKind("note_changed").lines.map((line) => ({ ...line, previousNote: null }));
    const preview = renderPreview(buildKitchenTicket({ ...BAR_TICKET, lines: changed }), "80mm");
    expect(preview).toContain("Cũ: (không có)");
  });

  it("keeps a hostile ticket inside 58mm paper and drops no letter", () => {
    const preview = renderPreview(buildKitchenTicket(BAR_TICKET), "58mm");
    expect(overflowingLines(preview, PAPER_COLUMNS["58mm"])).toEqual([]);
    expect(lettersOf(preview)).toContain(lettersOf(HOSTILE.longName));
  });
});
