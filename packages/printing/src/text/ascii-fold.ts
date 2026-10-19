/**
 * Letters and signs whose decomposition does not lead to ASCII. Each folds to ONE character,
 * so a folded line keeps the width the layout measured.
 */
const FOLDS: ReadonlyMap<string, string> = new Map([
  ["đ", "d"],
  ["Đ", "D"],
  ["₫", "d"],
  ["\u00a0", " "],
  ["\u202f", " "],
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["•", "*"],
  ["…", "."],
  ["×", "x"],
  ["ø", "o"],
  ["Ø", "O"],
  ["ł", "l"],
  ["Ł", "L"],
]);

/**
 * One print cell as one printable ASCII character, or undefined when there is none: tone and
 * vowel marks are dropped ("ấ" → "a"), the letters above are mapped, anything else (emoji,
 * CJK) has no honest ASCII spelling and is left for the caller's replacement character.
 */
export function asciiFoldCell(cell: string): string | undefined {
  const mapped = FOLDS.get(cell) ?? FOLDS.get(cell.normalize("NFC"));
  if (mapped !== undefined) return mapped;
  const stripped = cell.normalize("NFD").replace(/\p{M}/gu, "");
  const folded = FOLDS.get(stripped) ?? stripped;
  return /^[\x20-\x7e]$/.test(folded) ? folded : undefined;
}
