import type { LucideIcon } from "lucide-react";

/**
 * A line icon beside words that already say the same thing, so it is hidden from screen
 * readers. A button with only an icon carries its own `aria-label`.
 */
export function Icon({ of: Glyph, size = 18 }: { of: LucideIcon; size?: number }) {
  return <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={1.75} className="bo-icon" />;
}
