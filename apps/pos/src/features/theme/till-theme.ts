// The look a till is set to: a choice of the person at that till, kept in that browser, not a
// setting of the shop. index.html carries a copy of `resolveTheme` that runs before the first
// paint; till-theme.test.ts keeps the two in step.

/** What can be chosen; "system" follows the device's light or dark setting. */
export const THEME_CHOICES = ["pastel", "rangxay", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** What `data-theme` on <html> can say: "system" always resolves to one of these. */
export type AppliedTheme = Exclude<ThemeChoice, "system">;

export const THEME_STORAGE_KEY = "fnb.theme";
export const DEFAULT_THEME: ThemeChoice = "pastel";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);

/** The choice kept on this till; nothing kept, something unknown or no storage ⇒ the default. */
export function readThemeChoice(storage: () => Storage): ThemeChoice {
  try {
    const kept = storage().getItem(THEME_STORAGE_KEY);
    return isThemeChoice(kept) ? kept : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Keeps the choice; false when the browser refuses (private window, storage full). */
export function writeThemeChoice(storage: () => Storage, choice: ThemeChoice): boolean {
  try {
    storage().setItem(THEME_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

export const resolveTheme = (choice: ThemeChoice, deviceIsDark: boolean): AppliedTheme =>
  choice === "system" ? (deviceIsDark ? "dark" : "pastel") : choice;

/** Where a theme is applied: the page's root, its storage and the device's colour setting. */
export interface ThemeHost {
  readonly root: HTMLElement;
  storage(): Storage;
  /** Absent where the browser has none (jsdom): the device then counts as light. */
  readonly matchMedia?: ((query: string) => MediaQueryList) | undefined;
}

export interface TillTheme {
  choice(): ThemeChoice;
  /** Applies at once and keeps it; the screen is redrawn by the CSS, nothing reloads. */
  choose(choice: ThemeChoice): void;
  subscribe(listener: () => void): () => void;
  /** Stops following the device's setting. */
  stop(): void;
}

/** Applies the kept choice and, while it is "system", follows the device as it changes. */
export function startTillTheme(host: ThemeHost): TillTheme {
  let current = readThemeChoice(() => host.storage());
  const listeners = new Set<() => void>();
  let deviceDark: MediaQueryList | null = null;
  try {
    deviceDark = host.matchMedia?.(DARK_SCHEME_QUERY) ?? null;
  } catch {
    deviceDark = null;
  }
  const apply = () => {
    host.root.dataset.theme = resolveTheme(current, deviceDark?.matches ?? false);
  };
  const onDeviceChange = () => {
    if (current === "system") apply();
  };
  deviceDark?.addEventListener("change", onDeviceChange);
  apply();
  return {
    choice: () => current,
    choose(choice) {
      current = choice;
      writeThemeChoice(() => host.storage(), choice);
      apply();
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => deviceDark?.removeEventListener("change", onDeviceChange),
  };
}

let tillTheme: TillTheme | undefined;

/** This page's theme, started on first use (main.tsx starts it before the first render). */
export function theTillTheme(): TillTheme {
  tillTheme ??= startTillTheme({
    root: document.documentElement,
    storage: () => window.localStorage,
    matchMedia: typeof window.matchMedia === "function" ? (q) => window.matchMedia(q) : undefined,
  });
  return tillTheme;
}
