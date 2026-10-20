import { vi } from "../../messages/vi";

export type TillTool = "history" | "cash" | "close";

const LABELS: Readonly<Record<TillTool, string>> = {
  history: vi.history.open,
  cash: vi.cash.open,
  close: vi.closeShift.open,
};

/** The till's own tools beside selling: the day's orders, the drawer, closing the shift. */
export function TillTools(props: { onOpen(tool: TillTool): void }) {
  return (
    <nav className="pos-till-tools" aria-label={vi.tools.label}>
      {(Object.keys(LABELS) as TillTool[]).map((tool) => (
        <button key={tool} type="button" className="pos-button" onClick={() => props.onOpen(tool)}>
          {LABELS[tool]}
        </button>
      ))}
    </nav>
  );
}
