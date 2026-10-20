/**
 * Text folded for search: no tone marks, đ as d, lower case. A shop owner typing "tra sua"
 * on a phone keyboard without Telex finds "Trà sữa"; NFD also lines up names typed with
 * combining marks against the same names typed precomposed.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Whether `name` contains what was typed; nothing typed matches everything. */
export function matchesSearch(name: string, typed: string): boolean {
  const wanted = foldForSearch(typed);
  return wanted === "" || foldForSearch(name).includes(wanted);
}
