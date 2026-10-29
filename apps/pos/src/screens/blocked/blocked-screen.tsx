import { MonitorX } from "lucide-react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
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
    <ScreenFrame title={text.title} stage="narrow" stageMark={<GateMark of={MonitorX} tone="danger" />}>
      <div className="pos-gate__body">
        <p className="pos-gate__lead">{text.hint}</p>
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block pos-gate__action"
          onClick={onReload}
        >
          {vi.boot.reload}
        </button>
      </div>
    </ScreenFrame>
  );
}
