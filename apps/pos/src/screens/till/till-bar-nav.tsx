import { type ReactNode, createContext, useContext } from "react";

const TillBarNavContext = createContext<ReactNode>(null);

/**
 * Puts the selling modes and the till's tools inside the till's bar drawn under it, so a
 * till held sideways reads them on the bar's one row instead of a strip of their own. Only
 * the main selling screens wrap their bar in it; every other screen's bar stays plain.
 */
export function TillBarNav({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return <TillBarNavContext value={nav}>{children}</TillBarNavContext>;
}

/** What the bar carries besides where, who and the sync state; null on most screens. */
export const useTillBarNav = (): ReactNode => useContext(TillBarNavContext);
