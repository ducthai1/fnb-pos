import type { ReactNode } from "react";

/**
 * The frame every screen of a paired till sits in: the update strip (when there is one) across
 * the top, the screen under it taking what is left. The strip takes room instead of floating
 * over the screen, so it can never cover a product, a table or a button.
 */
export function TillFrame({ strip, children }: { strip: ReactNode; children: ReactNode }) {
  return (
    <div className="pos-till-frame">
      {strip}
      <div className="pos-till-frame__screen">{children}</div>
    </div>
  );
}
