import { useEffect, useRef } from "react";

/**
 * A function key of a till's keyboard (F2, F9, Esc…) that acts on the screen showing it, typed
 * anywhere, even in a field. Off while `enabled` is false, so a key never does what the
 * matching button would refuse; held down, it acts once.
 */
export function useTillKey(key: string, act: () => void, enabled = true): void {
  const latest = useRef(act);
  latest.current = act;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== key || event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      // A Vietnamese input method is still composing the word: the key is its, not the till's.
      if (event.isComposing) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
