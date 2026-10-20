const KEY = "fnb.backoffice.navCollapsed";

/** A tablet held sideways or a small laptop: the wide menu would leave tables too narrow. */
const NARROW_SCREEN = "(min-width: 768px) and (max-width: 1099px)";

const narrowScreen = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia(NARROW_SCREEN).matches;

/**
 * Whether the side menu starts narrowed to its icons: as this browser last left it, or,
 * when it never chose, narrowed on a screen between a phone and a computer. Storage may be
 * missing or refused (a private window); then the screen alone decides.
 */
export function rememberedCollapse(): boolean {
  if (typeof window === "undefined") return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  return stored === null ? narrowScreen() : stored === "1";
}

export function rememberCollapse(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembered; the menu still narrows for this visit.
  }
}
