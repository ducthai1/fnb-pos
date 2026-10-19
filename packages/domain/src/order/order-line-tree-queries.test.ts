import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Quantity,
  QUANTITY_SCALE,
  divideRounded,
  quantity,
  quantityFromThousandths,
} from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { childrenOf, effectiveQuantity, subtreeOf, validateLineTree } from "./order-line-tree";
import { codeOf, item, line } from "./order-line-test-fixtures";
import type { OrderLine } from "./order-types";

describe("line tree queries", () => {
  const order = [
    item("tea", quantity(2)),
    line("pearl", "modifier", "tea", quantity(2)),
    item("combo", quantity(3)),
    line("burger", "combo_component", "combo"),
    line("cheese", "modifier", "burger", quantity(2)),
    line("order-discount", "discount", null),
  ];
  const ids = (lines: OrderLine[]) => lines.map((l) => l.id);

  it("childrenOf lists only the direct children, in order", () => {
    expect(ids(childrenOf(order, "combo"))).toEqual(["burger"]);
    expect(ids(childrenOf(order, "pearl"))).toEqual([]);
  });

  it("subtreeOf returns the line and all its descendants but not its siblings", () => {
    expect(ids(subtreeOf(order, "combo"))).toEqual(["combo", "burger", "cheese"]);
    expect(ids(subtreeOf(order, "pearl"))).toEqual(["pearl"]);
  });

  it("counts two milk teas with two pearl portions each as four portions", () => {
    expect(effectiveQuantity(order, "pearl")).toBe(quantity(4));
    expect(effectiveQuantity(order, "tea")).toBe(quantity(2));
  });

  it("multiplies through a combo: 3 combos x 1 burger x 2 cheese slices = 6 slices", () => {
    expect(effectiveQuantity(order, "cheese")).toBe(quantity(6));
  });

  it("rescales once and rounds half-up when two fractional quantities meet", () => {
    const lines = [
      item("rice", quantity("1.5")),
      line("sauce", "modifier", "rice", quantity("0.333")),
    ];
    // 1.5 × 0.333 = 0.4995
    expect(effectiveQuantity(lines, "sauce")).toBe(quantity("0.5"));
  });

  it.each([
    ["childrenOf", () => childrenOf(order, "nope")],
    ["subtreeOf", () => subtreeOf(order, "nope")],
    ["effectiveQuantity", () => effectiveQuantity(order, "nope")],
  ])("%s refuses a line id that is not on the order", (_, query) => {
    expect(codeOf(query)).toBe(C.lineNotFound);
  });

  it("reports a cycle instead of looping forever on a corrupt tree", () => {
    const corrupt = [line("m1", "modifier", "m2"), line("m2", "modifier", "m1")];
    expect(codeOf(() => effectiveQuantity(corrupt, "m1"))).toBe(C.lineCycle);
    expect(codeOf(() => subtreeOf(corrupt, "m1"))).toBe(C.lineCycle);
  });
});

interface GeneratedLine {
  line: OrderLine;
  /** Quantities from this line up to its root item. */
  path: Quantity[];
}

function randomTree(qty: fc.Arbitrary<Quantity>): fc.Arbitrary<GeneratedLine[]> {
  const modifiers = fc.array(qty, { maxLength: 3 });
  const component = fc.record({ qty, modifiers });
  const rootItem = fc.record({ qty, modifiers, components: fc.array(component, { maxLength: 3 }) });
  return fc.array(rootItem, { minLength: 1, maxLength: 4 }).chain((items) => {
    const out: GeneratedLine[] = [];
    items.forEach((root, i) => {
      out.push({ line: item(`i${i}`, root.qty), path: [root.qty] });
      root.modifiers.forEach((q, m) => {
        out.push({ line: line(`i${i}m${m}`, "modifier", `i${i}`, q), path: [q, root.qty] });
      });
      root.components.forEach((c, k) => {
        const id = `i${i}c${k}`;
        out.push({ line: line(id, "combo_component", `i${i}`, c.qty), path: [c.qty, root.qty] });
        c.modifiers.forEach((q, m) => {
          out.push({ line: line(`${id}m${m}`, "modifier", id, q), path: [q, c.qty, root.qty] });
        });
      });
    });
    return fc.shuffledSubarray(out, { minLength: out.length });
  });
}

const product = (path: Quantity[]) => path.reduce<bigint>((acc, q) => acc * q, 1n);
const scaleFor = (path: Quantity[]) => QUANTITY_SCALE ** BigInt(path.length - 1);

describe("effectiveQuantity on random trees", () => {
  it("with whole units, is exactly the product of the quantities up to the root", () => {
    const wholeUnits = fc.bigInt({ min: 1n, max: 9n }).map((units) => quantity(units));
    fc.assert(
      fc.property(randomTree(wholeUnits), (generated) => {
        const lines = generated.map((g) => g.line);
        validateLineTree(lines);
        for (const { line: l, path } of generated) {
          expect(effectiveQuantity(lines, l.id) * scaleFor(path)).toBe(product(path));
        }
      }),
    );
  });

  it("with fractional quantities, is that product rounded half-up once, in any line order", () => {
    const thousandths = fc.bigInt({ min: 1n, max: 5_000n }).map(quantityFromThousandths);
    fc.assert(
      fc.property(randomTree(thousandths), (generated) => {
        const lines = generated.map((g) => g.line);
        validateLineTree(lines);
        for (const { line: l, path } of generated) {
          const expected = divideRounded(product(path), scaleFor(path), "half-up");
          expect(effectiveQuantity(lines, l.id)).toBe(expected);
        }
      }),
    );
  });
});
