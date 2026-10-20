const graphemes = new Intl.Segmenter("vi", { granularity: "grapheme" });
const firstGrapheme = (word: string) => graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? "";

/**
 * The letters a thing without a picture is marked with: the first letter of its first two
 * words ("Cà phê sữa" → "CP"), one whole character each (a mark or an emoji stays whole).
 */
export function nameMark(name: string): string {
  const words = name.trim().split(/\s+/u).filter((word) => word !== "");
  return words
    .slice(0, 2)
    .map(firstGrapheme)
    .join("")
    .toLocaleUpperCase("vi");
}
