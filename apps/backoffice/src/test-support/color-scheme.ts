/**
 * jsdom has no `matchMedia`; this one answers the dark-scheme query as an operating system
 * set to `dark` would, and tells the listeners when `schemeTurns` flips it.
 */
let dark = false;
const listeners = new Set<() => void>();

export function schemeOf(next: boolean) {
  dark = next;
  window.matchMedia = ((query: string) =>
    ({
      media: query,
      get matches() {
        return query.includes("prefers-color-scheme: dark") ? dark : false;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** The operating system turns dark or light while the page is open. */
export function schemeTurns(next: boolean) {
  dark = next;
  for (const listener of [...listeners]) listener();
}

export const schemeListenerCount = () => listeners.size;

/** Back to jsdom's own window, which has no `matchMedia`. */
export function forgetScheme() {
  listeners.clear();
  Reflect.deleteProperty(window, "matchMedia");
}
