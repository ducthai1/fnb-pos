/**
 * jsdom has no `matchMedia`; this one answers width queries as a screen `width` pixels wide
 * would, and tells the listeners when `screenOf` changes the width, as a turned tablet does.
 */
let width = 1280;
const listeners = new Set<() => void>();

export function screenOf(next: number) {
  width = next;
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
    const max = Number(/max-width: (\d+)px/.exec(query)?.[1] ?? Infinity);
    return {
      media: query,
      get matches() {
        return width >= min && width <= max;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  for (const listener of [...listeners]) listener();
}

/** Back to jsdom's own window, which has no `matchMedia`. */
export function forgetScreen() {
  listeners.clear();
  Reflect.deleteProperty(window, "matchMedia");
}
