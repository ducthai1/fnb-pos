/** Six calm tones; a person keeps theirs, chosen from their id, on every till. */
const TONES = 6;

/** The first character a reader sees, whole: an emoji or a letter with its marks. */
export function initialOf(name: string): string {
  const trimmed = name.trim().normalize("NFC");
  if (trimmed === "") return "?";
  const segmenter = new Intl.Segmenter("vi", { granularity: "grapheme" });
  const first = segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? "?";
  return first.toLocaleUpperCase("vi");
}

export function toneOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONES;
}

/**
 * A round initial standing for a person; their name is always written beside it. The initial
 * is drawn by CSS from data-initial, so a button holding both still reads as just the name.
 */
export function StaffAvatar(props: { id: string; name: string; size?: "md" | "lg" }) {
  return (
    <span
      className={props.size === "lg" ? "pos-avatar pos-avatar--lg" : "pos-avatar"}
      data-tone={toneOf(props.id)}
      data-initial={initialOf(props.name)}
      aria-hidden="true"
    />
  );
}
