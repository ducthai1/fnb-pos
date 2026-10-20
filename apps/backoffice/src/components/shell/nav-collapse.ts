const KEY = "fnb.backoffice.navCollapsed";

/**
 * Whether this browser last left the side menu narrowed to its icons. Storage may be
 * missing or refused (a private window); then the menu is simply wide.
 */
export function rememberedCollapse(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberCollapse(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembered; the menu still narrows for this visit.
  }
}
