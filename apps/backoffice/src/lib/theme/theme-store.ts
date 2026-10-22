import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEME_KEY,
  type ThemeChoice,
  applyThemeChoice,
  parseThemeChoice,
  readThemeChoice,
  systemPrefersDark,
  watchSystemScheme,
  writeThemeChoice,
} from "./theme-choice";

// The page's one record of the look is <html> itself: the head's script wrote the choice
// there before the first paint, and every picker on the page reads it from there, so the
// bar's picker and the drawer's always agree.

const browserStorage = () => window.localStorage;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function root(): HTMLElement {
  return document.documentElement;
}

/** The choice the page is drawn in; read from storage when the head's script did not run. */
export function currentThemeChoice(): ThemeChoice {
  const written = root().getAttribute("data-theme-choice");
  return written === null ? readThemeChoice(browserStorage) : parseThemeChoice(written);
}

function redraw(choice: ThemeChoice) {
  applyThemeChoice(root(), choice, systemPrefersDark(window));
  for (const listener of [...listeners]) listener();
}

/** Applies `choice` at once, without a reload, and keeps it for the next visit. */
export function chooseTheme(choice: ThemeChoice): void {
  writeThemeChoice(browserStorage, choice);
  redraw(choice);
}

function onStorage(event: StorageEvent) {
  // Another tab of the same machine chose a look: this one follows.
  if (event.key === THEME_KEY) redraw(parseThemeChoice(event.newValue));
}

function startWatching() {
  const stopScheme = watchSystemScheme(window, () => {
    if (currentThemeChoice() === "system") redraw("system");
  });
  window.addEventListener("storage", onStorage);
  return () => {
    stopScheme();
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Hears every change of the look (a picker, another tab, the operating system when the
 * choice is "system"); the first listener starts the watching, the last one stops it.
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  stopWatching ??= startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

/** The current choice, kept in step with every change; the default while rendering on the server. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeTheme, currentThemeChoice, () => DEFAULT_THEME);
}
