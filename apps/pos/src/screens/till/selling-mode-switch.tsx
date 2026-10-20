import { LayoutGrid, type LucideIcon, ShoppingBag } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

export type SellingMode = "counter" | "tables";

const M = vi.tables.modes;

/** Counter sales or the floor, for a branch that serves at tables; on the main screens only. */
export function SellingModeSwitch(props: { mode: SellingMode; onChange(mode: SellingMode): void }) {
  const option = (mode: SellingMode, label: string, glyph: LucideIcon) => (
    <button
      type="button"
      className="pos-tab pos-mode"
      aria-pressed={props.mode === mode}
      onClick={() => props.onChange(mode)}
    >
      <Icon of={glyph} />
      {label}
    </button>
  );
  return (
    <nav className="pos-modes" aria-label={M.label}>
      {option("counter", M.counter, ShoppingBag)}
      {option("tables", M.tables, LayoutGrid)}
    </nav>
  );
}
