import { MonitorX } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";

export type BlockReason = "another_tab" | "unsupported" | "failed";

const TEXT: Record<BlockReason, { title: string; hint: string }> = {
  another_tab: { title: vi.boot.openInAnotherTab, hint: vi.boot.openInAnotherTabHint },
  unsupported: { title: vi.boot.unsupported, hint: vi.boot.unsupportedHint },
  failed: { title: vi.boot.failed, hint: vi.boot.failedHint },
};

/** The till cannot sell from this tab; says why and offers the one thing to do. */
export function BlockedScreen({ reason, onReload }: { reason: BlockReason; onReload: () => void }) {
  const text = TEXT[reason];
  return (
    <ScreenFrame title={text.title} width="narrow">
      <div className="pos-signin">
        <div className="pos-signin__lead">
          <span className="pos-signin__mark" data-tone="danger">
            <Icon of={MonitorX} size={26} />
          </span>
          <p className="pos-hint">{text.hint}</p>
        </div>
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block"
          onClick={onReload}
        >
          {vi.boot.reload}
        </button>
      </div>
    </ScreenFrame>
  );
}
