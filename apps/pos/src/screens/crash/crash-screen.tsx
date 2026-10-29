import { RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";

/**
 * What the cashier sees when a screen of the till failed to draw: that the sales data is
 * safe on the device, and the one thing to do. Reloading is safe because every sale is
 * written to the device's database before anything else happens to it.
 */
export function CrashScreen({ onReload }: { onReload: () => void }) {
  return (
    <ScreenFrame
      title={vi.crash.title}
      stage="narrow"
      stageMark={<GateMark of={TriangleAlert} tone="danger" />}
    >
      <div className="pos-gate__body pos-recovery" data-crash-screen>
        <p className="pos-gate__lead">{vi.crash.hint}</p>
        <div className="pos-recovery__safe" role="note">
          <span className="pos-recovery__safe-mark">
            <Icon of={ShieldCheck} size={22} />
          </span>
          <div>
            <p className="pos-recovery__safe-title">{vi.crash.safeTitle}</p>
            <p className="pos-hint">{vi.crash.safeHint}</p>
          </div>
        </div>
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block pos-gate__action"
          onClick={onReload}
        >
          <Icon of={RefreshCw} size={20} />
          {vi.crash.reload}
        </button>
      </div>
    </ScreenFrame>
  );
}
