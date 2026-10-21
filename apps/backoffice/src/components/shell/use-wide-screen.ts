import { useSyncExternalStore } from "react";

/** From this width the menu is a bar across the top; below it, a drawer behind a button. */
export const WIDE_SCREEN = "(min-width: 1024px)";

const wideQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_SCREEN) : null;

function subscribe(changed: () => void): () => void {
  const query = wideQuery();
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
}

/**
 * Whether the screen has room for the menu bar, following the screen as it turns or the
 * window is resized. A browser that cannot tell counts as a computer.
 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, () => wideQuery()?.matches ?? true, () => true);
}
