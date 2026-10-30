import { WifiOff } from "lucide-react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { ScreenFrame } from "../shared/screen-frame";

const T = vi.qr.leaveWhileOffline;

/**
 * Asked before a QR is taken down while the till cannot hear the bank: the guest may have
 * transferred already, and cash taken on top would be paid twice. Staying is the main choice;
 * taking the QR down is for a cashier who has looked at the bank's app. A card in the middle
 * of the screen, like the other screens that stop the till, which scrolls inside its frame
 * when a phone is too short for it.
 */
export function LeaveQrWhileOfflineSheet(props: { onChoose(takeDown: boolean): void }) {
  return (
    <ScreenFrame title={T.title} stage="narrow" stageMark={<GateMark of={WifiOff} tone="danger" />}>
      <div className="pos-gate__body" data-qr-leave-offline>
        <p className="pos-gate__lead" role="alert">
          {T.hint}
        </p>
        <section className="pos-gate__list-block" aria-label={T.checksLabel}>
          <ul className="pos-gate__list">
            {T.checks.map((check) => (
              <li key={check}>
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="pos-gate__note" data-tone="danger">
          {T.risk}
        </p>
        <button
          type="button"
          className="pos-button pos-button--primary pos-button--block pos-gate__action"
          onClick={() => props.onChoose(false)}
        >
          {T.stay}
        </button>
        <button
          type="button"
          className="pos-button pos-button--block"
          onClick={() => props.onChoose(true)}
        >
          {T.go}
        </button>
      </div>
    </ScreenFrame>
  );
}
