import { RefreshCw } from "lucide-react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { ScreenFrame } from "../shared/screen-frame";

/**
 * Shown when the server serves no build as old as this one. Nothing else on the till works
 * until it updates, so there is one button; the commands the till holds stay in its database
 * through the reload, and the screen says how many wait so the cashier knows nothing is lost.
 */
export function UpdateRequiredScreen({
  pendingCommands,
  updating,
  onUpdate,
}: {
  pendingCommands: number;
  updating: boolean;
  onUpdate: () => void;
}) {
  return (
    <ScreenFrame
      title={vi.update.required.title}
      stage="narrow"
      stageMark={<GateMark of={RefreshCw} tone="danger" />}
    >
      <div className="pos-gate__body" data-update-required>
        <p className="pos-gate__lead">{vi.update.required.hint}</p>
        <p className="pos-gate__note" role="status">
          {pendingCommands > 0
            ? vi.update.required.pending(pendingCommands)
            : vi.update.required.nothingPending}
        </p>
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block pos-gate__action"
          disabled={updating}
          onClick={onUpdate}
        >
          {updating ? vi.update.updating : vi.update.now}
        </button>
        <p className="pos-gate__fine-print">{vi.update.required.stillOld}</p>
      </div>
    </ScreenFrame>
  );
}
