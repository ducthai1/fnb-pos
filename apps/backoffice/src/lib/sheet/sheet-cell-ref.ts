const REF = /^([A-Z]{1,3})\d*$/;

/** The zero-based column of a cell reference ("A1" → 0, "AB7" → 27), or null. */
export function columnIndexOf(ref: string): number | null {
  const letters = REF.exec(ref.toUpperCase())?.[1];
  if (letters === undefined) return null;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** The letters of a zero-based column (0 → "A", 27 → "AB"). */
export function columnLetters(index: number): string {
  let letters = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}
