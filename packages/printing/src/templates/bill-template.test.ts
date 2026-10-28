import { formatVnd, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { PAPER_COLUMNS, type PaperWidth } from "../layout/print-document";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { renderEscPosChunks } from "../render/render-escpos";
import { renderPreview } from "../render/render-preview";
import { chunksAsHex, expectGolden } from "../test-support/golden-file";
import { HOSTILE } from "../test-support/hostile-print-data";
import { lettersOf, overflowingLines } from "../test-support/preview-checks";
import { asciiPrinter, cp1258Printer } from "../test-support/print-profiles";
import { printingCodeOf } from "../test-support/printing-error-code";
import { HOSTILE_BILL, TABLE_BILL } from "../test-support/template-fixtures";
import { ASCII_FOLD, CP1258 } from "../text/encode-text";
import { buildBill } from "./bill-template";

const papers: PaperWidth[] = ["58mm", "80mm"];

describe("bill", () => {
  it.each(papers)("prints a table bill on %s as in its golden files", (paper) => {
    const bill = buildBill(TABLE_BILL);
    expectGolden(`bill-table-${paper}.txt`, renderPreview(bill, paper));
    expectGolden(
      `bill-table-${paper}.hex`,
      chunksAsHex(renderEscPosChunks(bill, cp1258Printer(paper))),
    );
  });

  it("prints a combo's picks under it and each pick's options under the pick", () => {
    const combo = {
      name: "Combo sáng",
      quantity: quantity(1),
      unitPrice: vnd(50_000),
      amount: vnd(65_000),
      note: null,
      children: [
        { name: "Trà sữa (L)", quantity: quantity(1), amount: vnd(10_000), depth: 1 },
        { name: "Trân châu", quantity: quantity(1), amount: vnd(5_000), depth: 2 },
      ],
    };
    const preview = renderPreview(buildBill({ ...TABLE_BILL, lines: [combo] }), "80mm");
    const lines = preview.split("\n");
    const pick = lines.find((line) => line.includes("+ Trà sữa (L)")) ?? "";
    const topping = lines.find((line) => line.includes("+ Trân châu")) ?? "";
    expect(pick.indexOf("+")).toBe(2);
    expect(topping.indexOf("+")).toBe(4);
    expect(topping.replace(/\u00a0/g, " ")).toContain("5.000 ₫");
  });

  it("prints hostile data folded to ASCII on 58mm as in its golden files", () => {
    const bill = buildBill(HOSTILE_BILL);
    expectGolden("bill-hostile-58mm.txt", renderPreview(bill, "58mm", ASCII_FOLD));
    expectGolden(
      "bill-hostile-58mm.hex",
      chunksAsHex(renderEscPosChunks(bill, asciiPrinter("58mm"))),
    );
  });

  it.each(papers)(
    "keeps every line of hostile data inside %s paper and drops no letter",
    (paper) => {
      const preview = renderPreview(buildBill(HOSTILE_BILL), paper);
      expect(overflowingLines(preview, PAPER_COLUMNS[paper])).toEqual([]);
      expect(lettersOf(preview)).toContain(lettersOf(HOSTILE.longName));
    },
  );

  it("prints a weighed line as its grams times the price per unit, at the domain's amount", () => {
    const strawberries = {
      name: "Dâu tây Đà Lạt",
      quantity: quantity("0.353"),
      weighed: { grams: 353, per: "kg" },
      unitPrice: vnd(200_000),
      amount: vnd(70_600),
      children: [],
      note: null,
    } as const;
    const beans = {
      ...strawberries,
      name: "Cà phê hạt",
      quantity: quantity("3.51"),
      weighed: { grams: 351, per: "100g" },
      unitPrice: vnd(32_000),
      amount: vnd(112_320),
    } as const;
    const bill = { ...TABLE_BILL, lines: [strawberries, beans, ...TABLE_BILL.lines] };
    const read = (paper: PaperWidth) =>
      renderPreview(buildBill(bill), paper).replace(/\u00a0/g, " ");
    expect(read("80mm")).toMatch(/353 g x 200\.000 ₫\/kg +70\.600 ₫/);
    expect(read("80mm")).toMatch(/351 g x 32\.000 ₫\/100 g +112\.320 ₫/);
    expect(read("80mm")).toContain("2 x 35.000 ₫");
    // Too long for 58mm beside its amount: the weight keeps the amount, the price goes under.
    expect(read("58mm")).toMatch(/ 351 g +112\.320 ₫\n +x 32\.000 ₫\/100 g\n/);
    for (const paper of papers) {
      expect(overflowingLines(renderPreview(buildBill(bill), paper), PAPER_COLUMNS[paper])).toEqual(
        [],
      );
    }
  });

  it("puts each amount at the right margin of its line", () => {
    const lines = renderPreview(buildBill(TABLE_BILL), "80mm").split("\n");
    for (const amount of [vnd(90_000), vnd(119_000), vnd(121_451), vnd(78_549)]) {
      const line = lines.find((l) => l.endsWith(` ${formatVnd(amount)}`));
      expect(line?.length, formatVnd(amount)).toBe(PAPER_COLUMNS["80mm"]);
    }
    expect(lines).toContain(`Giảm 10% thành viên${" ".repeat(20)}-11.900\u00a0₫`);
  });

  it("prints the lookup code and its QR only when there is one", () => {
    const withLookup = renderPreview(buildBill(TABLE_BILL), "80mm");
    expect(withLookup).toContain("Mã tra cứu: K26TAB0000012");
    const qr = lettersOf("[QR https://hoadon.example.vn/tra-cuu?ma=K26TAB0000012]");
    expect(lettersOf(withLookup)).toContain(qr);
    const without = renderPreview(buildBill({ ...TABLE_BILL, lookup: null }), "80mm");
    expect(without).not.toContain("[QR");
    expect(without).not.toContain("Mã tra cứu");
  });

  it("prints change, table and call number only when there are any", () => {
    const preview = renderPreview(buildBill(HOSTILE_BILL), "80mm");
    expect(renderPreview(buildBill(TABLE_BILL), "80mm")).toContain("Tiền thừa");
    expect(preview).not.toContain("Tiền thừa");
    expect(preview).not.toContain("Bàn:");
    expect(preview).not.toContain("S ố   g ọ i");
  });

  it("says whether tax was included in the prices or added on top", () => {
    expect(renderPreview(buildBill(TABLE_BILL), "80mm")).toMatch(/^Thuế 8% +8\.996/m);
    const included = renderPreview(buildBill({ ...TABLE_BILL, pricesIncludeTax: true }), "80mm");
    expect(included).toMatch(/^Đã gồm thuế 8% +8\.996/m);
    expect(included).not.toMatch(/^Thuế 8%/m);
  });

  it("previews what the printer can spell when given its encoding", () => {
    const bill = buildBill(HOSTILE_BILL);
    expect(renderPreview(bill, "80mm", ASCII_FOLD)).toContain("Tra dao ?? cam sa ??? size khung");
    expect(renderPreview(bill, "80mm", CP1258)).toContain("Trà đào ?? cam sả ??? size khủng");
    expect(renderPreview(bill, "80mm")).toContain("Trà đào 🍑🧋 cam sả");
  });

  it("refuses Windows-1258 text on a printer profile without its code page", () => {
    const profile = { ...cp1258Printer("80mm"), codePage: null };
    const bill = buildBill(TABLE_BILL);
    expect(printingCodeOf(() => renderEscPosChunks(bill, profile))).toBe(C.codePageRequired);
    expect(printingCodeOf(() => renderEscPosChunks(bill, asciiPrinter("80mm")))).toBeUndefined();
  });
});
