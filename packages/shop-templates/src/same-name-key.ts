/**
 * What makes two names the same menu entry to a person: "Cà phê", "ca phe" and " CÀ  PHÊ "
 * are one category. Applying a template compares by this, so it never adds a second copy of
 * something the shop already typed its own way.
 */
export function sameNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
