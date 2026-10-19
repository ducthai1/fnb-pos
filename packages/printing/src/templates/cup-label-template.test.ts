import { quantity, quantityFromThousandths } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { labelColumns } from "../label/lay-out-label";
import { renderLabelPreview, renderTsplChunks } from "../label/render-tspl-labels";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { commandsAsHex, expectGolden } from "../test-support/golden-file";
import { HOSTILE } from "../test-support/hostile-print-data";
import { overflowingLines } from "../test-support/preview-checks";
import { CUP_LABEL_PRINTER } from "../test-support/print-profiles";
import { printingCodeOf } from "../test-support/printing-error-code";
import { TWO_ITEM_CUPS } from "../test-support/template-fixtures";
import { type CupItem, buildCupLabels } from "./cup-label-template";
import { PRINT_LABELS_VI } from "./print-labels-vi";

const more = PRINT_LABELS_VI.moreLines;
const tea = TWO_ITEM_CUPS.items[0] as CupItem;
const withItems = (...items: CupItem[]) => ({ ...TWO_ITEM_CUPS, items });

describe("cup labels", () => {
  it("prints one label per cup as in its golden files", () => {
    const labels = buildCupLabels(TWO_ITEM_CUPS);
    expectGolden("cup-labels-40x30.txt", renderLabelPreview(labels, CUP_LABEL_PRINTER, more));
    expectGolden(
      "cup-labels-40x30.hex",
      commandsAsHex(renderTsplChunks(labels, CUP_LABEL_PRINTER, more)),
    );
  });

  it("numbers the cups across the whole order", () => {
    const labels = buildCupLabels(TWO_ITEM_CUPS);
    expect(labels.map((label) => label[1]?.text)).toEqual(["1/3 14:05", "2/3 14:05", "3/3 14:05"]);
    expect(labels.map((label) => label[2]?.text)).toEqual([
      "Trà sữa trân châu",
      "Trà sữa trân châu",
      "Trà đào cam sả",
    ]);
  });

  it("leaves out the options a drink does not have", () => {
    const [label] = buildCupLabels(
      withItems({
        ...tea,
        quantity: quantity(1),
        size: null,
        sugar: null,
        ice: null,
        toppings: [],
      }),
    );
    expect(label?.map((line) => line.text)).toEqual(["#12", "1/1 14:05", "Trà sữa trân châu"]);
  });

  it("refuses part of a cup, no cup and a negative cup", () => {
    for (const q of [quantityFromThousandths(1500n), quantity(0), quantity(-1)]) {
      expect(printingCodeOf(() => buildCupLabels(withItems({ ...tea, quantity: q })))).toBe(
        C.invalidCupQuantity,
      );
    }
  });

  it("says how many lines did not fit on the sticker instead of silently cutting them", () => {
    const loaded = withItems({ ...tea, quantity: quantity(1), toppings: HOSTILE.thirtyToppings });
    const preview = renderLabelPreview(buildCupLabels(loaded), CUP_LABEL_PRINTER, more);
    const rows = preview.split("\n").filter((row) => row.startsWith("|"));
    // 1 large line + 7 normal ones fit; the 7th becomes the marker for itself and the rest.
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)).toMatch(/^\|\.\.\.còn 29 dòng +\|$/);
    expect(rows.at(-2)).toMatch(/^\|\+ Topping số 1 +\|$/);
  });

  it("keeps hostile names inside the label's width", () => {
    const hostile = withItems({
      ...tea,
      quantity: quantity(1),
      name: HOSTILE.longName,
      note: HOSTILE.emojiName,
    });
    const preview = renderLabelPreview(buildCupLabels(hostile), CUP_LABEL_PRINTER, more);
    expect(overflowingLines(preview, labelColumns(CUP_LABEL_PRINTER) + 2)).toEqual([]);
  });
});
