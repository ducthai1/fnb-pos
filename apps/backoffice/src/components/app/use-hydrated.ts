"use client";

import { useEffect, useState } from "react";

/**
 * True once React runs in the browser. A prerendered form is on screen before that, and
 * what is typed into it then is lost; pages mark themselves with it, so a test (or a
 * script) waits for the mark instead of for the HTML.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
