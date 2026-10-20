import { vi } from "../../messages/vi";

export type SellingMode = "counter" | "tables";

const M = vi.tables.modes;

/** Counter sales or the floor, for a branch that serves at tables; on the main screens only. */
export function SellingModeSwitch(props: { mode: SellingMode; onChange(mode: SellingMode): void }) {
  const option = (mode: SellingMode, label: string) => (
    <button
      type="button"
      className="pos-tab pos-mode"
      aria-pressed={props.mode === mode}
      onClick={() => props.onChange(mode)}
    >
      {label}
    </button>
  );
  return (
    <nav className="pos-modes" aria-label={M.label}>
      {option("counter", M.counter)}
      {option("tables", M.tables)}
    </nav>
  );
}
