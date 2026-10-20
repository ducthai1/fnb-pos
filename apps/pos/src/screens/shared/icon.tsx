import type { LucideIcon } from "lucide-react";

/**
 * A line icon beside words that already say the same thing, so it is hidden from screen
 * readers; an icon alone on a button needs that button's aria-label instead.
 */
export function Icon({ of: Glyph, size = 20 }: { of: LucideIcon; size?: number }) {
  return (
    <Glyph
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={2}
      className="pos-icon"
    />
  );
}
