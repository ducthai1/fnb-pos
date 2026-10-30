import { TriangleAlert } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";

const T = vi.qr.leaveWhileOffline;

/**
 * Asked before a QR is taken down while the till cannot hear the bank: the guest may have
 * transferred already, and cash taken on top would be paid twice. Staying is the main choice;
 * taking the QR down is for a cashier who has looked at the bank's app. A whole screen over
 * the payment drawer, like the manager's approval, so a long sentence scrolls on a phone.
 */
export function LeaveQrWhileOfflineSheet(props: { onChoose(takeDown: boolean): void }) {
  return (
    <ScreenFrame
      enter="sheet"
      title={T.title}
      dock={
        <div className="pos-actions">
          <button type="button" className="pos-button" onClick={() => props.onChoose(true)}>
            {T.go}
          </button>
          <button
            type="button"
            className="pos-button pos-button--primary"
            onClick={() => props.onChoose(false)}
          >
            {T.stay}
          </button>
        </div>
      }
    >
      <p className="pos-hint pos-hint--warn pos-wrap" role="alert">
        <Icon of={TriangleAlert} size={20} /> {T.hint}
      </p>
    </ScreenFrame>
  );
}
