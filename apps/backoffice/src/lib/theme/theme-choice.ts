// The look of the backoffice, chosen per machine: a person's taste on that screen, not a
// setting of the shop. The till keeps the same key and the same names, so a counter's
// computer that opens both shows one look.

/** Where the choice is kept, in the browser of that machine. */
export const THEME_KEY = "fnb.theme";

/** Every choice in the order the picker lists them; "system" follows the operating system. */
export const THEME_CHOICES = ["pastel", "rangxay", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
/** A look the tokens draw: what "system" becomes once the operating system is asked. */
export type Theme = Exclude<ThemeChoice, "system">;

export const DEFAULT_THEME: Theme = "pastel";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseThemeChoice(raw: unknown): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === raw) ?? DEFAULT_THEME;
}

/**
 * The choice kept on this machine; nothing kept, a value from elsewhere, or a browser that
 * refuses its storage (private mode, blocked site data) all mean the default.
 */
export function readThemeChoice(storage: () => Pick<Storage, "getItem">): ThemeChoice {
  try {
    return parseThemeChoice(storage().getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Keeps the choice; false when the browser refuses (the look still changes for this visit). */
export function writeThemeChoice(storage: () => Pick<Storage, "setItem">, choice: ThemeChoice): boolean {
  try {
    storage().setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** Whether the operating system asks for dark; false where it cannot be asked. */
export function systemPrefersDark(win: Pick<Window, "matchMedia"> | undefined): boolean {
  try {
    return win?.matchMedia(DARK_QUERY).matches ?? false;
  } catch {
    return false;
  }
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice !== "system") return choice;
  return prefersDark ? "dark" : DEFAULT_THEME;
}

/**
 * The colour of the bar across the top in each look (`--c-bg` with a fifth of `--c-surface`
 * mixed in, as backoffice-shell.css draws it), given to the browser as
 * `<meta name="theme-color">` so a phone's status bar or an installed window's title bar
 * runs on from the bar.
 */
export const THEME_BAR_COLOUR: Readonly<Record<Theme, string>> = {
  pastel: "#f5f8fd",
  rangxay: "#f6f0e6",
  dark: "#12181f",
};

/** Puts the bar's colour of `theme` in the page's theme-color, adding the tag when missing. */
export function applyThemeColour(doc: Document, theme: Theme): void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) {
    meta = doc.createElement("meta");
    meta.name = "theme-color";
    doc.head.append(meta);
  }
  meta.content = THEME_BAR_COLOUR[theme];
}

/** Draws the page in `choice`: the look on `data-theme`, the choice itself beside it. */
export function applyThemeChoice(root: HTMLElement, choice: ThemeChoice, prefersDark: boolean): void {
  const theme = resolveTheme(choice, prefersDark);
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-choice", choice);
  applyThemeColour(root.ownerDocument, theme);
}

/** Listens for the operating system turning dark or light; returns the way to stop. */
export function watchSystemScheme(win: Pick<Window, "matchMedia"> | undefined, onChange: () => void): () => void {
  let query: MediaQueryList | undefined;
  try {
    query = win?.matchMedia(DARK_QUERY);
    query?.addEventListener("change", onChange);
  } catch {
    return () => undefined;
  }
  return () => query?.removeEventListener("change", onChange);
}

/**
 * The same steps as readThemeChoice, resolveTheme and applyThemeChoice (theme-color too), as a script the root
 * layout puts in the page's head: it runs before the first paint, so the page never shows
 * the default look first and then another.
 */
export const THEME_BOOT_SCRIPT = `(function(){var c=null,d=document.documentElement,k=${JSON.stringify(THEME_CHOICES)};try{c=window.localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}if(k.indexOf(c)<0)c=${JSON.stringify(DEFAULT_THEME)};var t=c;if(c==="system"){t=${JSON.stringify(DEFAULT_THEME)};try{if(window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches)t="dark"}catch(e){}}d.setAttribute("data-theme",t);d.setAttribute("data-theme-choice",c);var b=${JSON.stringify(THEME_BAR_COLOUR)},m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=b[t]})();`;
