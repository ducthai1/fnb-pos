import { toPrintCells } from "../text/print-cells";

/** Lines of a preview that are wider than the paper, with their widths, for a failure message. */
export function overflowingLines(preview: string, columns: number): string[] {
  return preview
    .split("\n")
    .filter((line) => toPrintCells(line).length > columns)
    .map((line) => `${toPrintCells(line).length}: ${line}`);
}

/** The text's letters with every space and line break removed, to check nothing was lost. */
export function lettersOf(text: string): string {
  return toPrintCells(text)
    .filter((cell) => cell !== " ")
    .join("");
}
