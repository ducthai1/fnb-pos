/**
 * The YAML block at the head of a handbook page, in the one shape the handbook writes:
 * `key: value`, `key: []`, or `key:` followed by `  - item` lines. Anything else is refused,
 * so a page that drifts from that shape fails its check instead of being misread.
 */
export type FrontMatter = Readonly<Record<string, string | readonly string[]>>;

export function readFrontMatter(page: string): FrontMatter {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(page);
  if (match === null) throw new Error("the page does not start with a --- block");
  const fields: Record<string, string | string[]> = {};
  let list: string[] | null = null;
  for (const line of match[1]!.split("\n")) {
    const item = /^ {2}- (.+)$/.exec(line);
    if (item !== null) {
      if (list === null) throw new Error(`a list item outside a list: ${line}`);
      list.push(item[1]!.trim());
      continue;
    }
    const field = /^([a-z]+):(?: (.*))?$/.exec(line);
    if (field === null) throw new Error(`not a field of the block: ${line}`);
    const [, key, value] = field;
    if (value === undefined || value === "") {
      list = [];
      fields[key!] = list;
    } else {
      list = null;
      fields[key!] = value === "[]" ? [] : value.trim();
    }
  }
  return fields;
}

/** A field that must be a list, empty when the block leaves it out. */
export function listOf(fields: FrontMatter, key: string): readonly string[] {
  const value = fields[key];
  if (value === undefined) return [];
  if (typeof value === "string") throw new Error(`"${key}" must be a list`);
  return value;
}
