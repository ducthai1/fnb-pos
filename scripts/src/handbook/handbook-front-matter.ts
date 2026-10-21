/**
 * The block of fields at the top of a handbook page, between two `---` lines. Only the
 * small part of YAML the handbook uses: `key: value`, `key: []`, `key: [a, b]` and a list
 * of `- item` lines under `key:`. Anything else is reported, so a typo never quietly drops
 * a screen out of the coverage check.
 */
export interface HandbookFrontMatter {
  readonly title: string;
  /** Who reads the page; one name (`audience: quan-ly`) or a list (a till page for two jobs). */
  readonly audience: readonly string[];
  readonly screens: readonly string[];
  readonly decisions: readonly string[];
  readonly tests: readonly string[];
}

export const AUDIENCES = ["chu-quan", "quan-ly", "thu-ngan", "pha-che", "van-hanh"] as const;

const LIST_KEYS = ["audience", "screens", "decisions", "tests"] as const;
type ListKey = (typeof LIST_KEYS)[number];

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

function inlineList(value: string): string[] | null {
  const match = /^\[(.*)\]$/.exec(value.trim());
  if (match === null) return null;
  const inside = match[1]?.trim() ?? "";
  return inside === "" ? [] : inside.split(",").map(unquote);
}

/** The fields of `markdown`'s front matter, or the reason it has none that can be read. */
export function parseFrontMatter(
  markdown: string,
): { ok: true; value: HandbookFrontMatter } | { ok: false; reason: string } {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return { ok: false, reason: "does not start with a --- line" };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { ok: false, reason: "front matter has no closing --- line" };

  const scalars = new Map<string, string>();
  const lists = new Map<ListKey, string[]>();
  let open: ListKey | null = null;
  for (const [offset, line] of lines.slice(1, end).entries()) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item !== null) {
      if (open === null)
        return { ok: false, reason: `line ${offset + 2}: list item outside a list` };
      lists.get(open)?.push(unquote(item[1] ?? ""));
      continue;
    }
    const field = /^([a-z]+):\s*(.*)$/.exec(line);
    if (field === null) return { ok: false, reason: `line ${offset + 2}: not a "key: value" line` };
    const key = field[1] ?? "";
    const value = field[2] ?? "";
    open = null;
    if ((LIST_KEYS as readonly string[]).includes(key)) {
      const listKey = key as ListKey;
      const inline =
        value === "" ? [] : (inlineList(value) ?? (listKey === "audience" ? [unquote(value)] : null));
      if (inline === null) return { ok: false, reason: `${key} must be a list` };
      lists.set(listKey, inline);
      if (value === "") open = listKey;
    } else {
      scalars.set(key, unquote(value));
    }
  }

  const title = scalars.get("title") ?? "";
  const audience = lists.get("audience") ?? [];
  if (title === "") return { ok: false, reason: "title is missing" };
  if (audience.length === 0) return { ok: false, reason: "audience is missing" };
  const stranger = audience.find((who) => !(AUDIENCES as readonly string[]).includes(who));
  if (stranger !== undefined) {
    return { ok: false, reason: `audience "${stranger}" is not one of ${AUDIENCES.join(", ")}` };
  }
  for (const key of LIST_KEYS) {
    if (!lists.has(key))
      return { ok: false, reason: `${key} is missing (write "${key}: []" when there is none)` };
  }
  return {
    ok: true,
    value: {
      title,
      audience,
      screens: lists.get("screens") ?? [],
      decisions: lists.get("decisions") ?? [],
      tests: lists.get("tests") ?? [],
    },
  };
}
