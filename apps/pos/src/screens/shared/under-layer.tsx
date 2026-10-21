import type { ReactNode } from "react";
import { TillKeysLive } from "./use-till-key";

/**
 * The screen a checkout opens over. Under the drawer it stays mounted as it was (the category
 * picked, where the order was scrolled) but cannot be reached: inert to touch, Tab and screen
 * readers, and its keys off, until the checkout closes. Under a step that takes the whole
 * screen (`gone`) it is not drawn at all, so nothing of it is on the page twice.
 */
export function UnderLayer({
  covered,
  gone = false,
  children,
}: {
  covered: boolean;
  gone?: boolean;
  children: ReactNode;
}) {
  return (
    // aria-hidden says what inert already does, for tools that only read ARIA.
    <div
      className="pos-under"
      inert={covered}
      aria-hidden={covered ? true : undefined}
      data-covered={covered}
    >
      <TillKeysLive.Provider value={!covered}>{gone ? null : children}</TillKeysLive.Provider>
    </div>
  );
}

/** A step of the checkout that needs the whole screen, over the one it opened from. */
export function CoverLayer({ children }: { children: ReactNode }) {
  return <div className="pos-cover">{children}</div>;
}
