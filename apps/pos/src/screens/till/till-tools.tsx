import { History, LockKeyhole, type LucideIcon, Wallet } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

export type TillTool = "history" | "cash" | "close";

const TOOLS: Readonly<Record<TillTool, { label: string; icon: LucideIcon }>> = {
  history: { label: vi.history.open, icon: History },
  cash: { label: vi.cash.open, icon: Wallet },
  close: { label: vi.closeShift.open, icon: LockKeyhole },
};

/** The till's own tools beside selling: the day's orders, the drawer, closing the shift. */
export function TillTools(props: { onOpen(tool: TillTool): void }) {
  return (
    <nav className="pos-till-tools" aria-label={vi.tools.label}>
      {(Object.keys(TOOLS) as TillTool[]).map((tool) => (
        <button
          key={tool}
          type="button"
          className="pos-button pos-button--sm pos-tool"
          onClick={() => props.onOpen(tool)}
        >
          <Icon of={TOOLS[tool].icon} />
          {TOOLS[tool].label}
        </button>
      ))}
    </nav>
  );
}
