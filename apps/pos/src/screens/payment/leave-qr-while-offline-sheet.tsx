import { TriangleAlert } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.qr.leaveWhileOffline;

/**
 * Asked before a QR is taken down while the till cannot hear the bank's notice: the guest may
 * have transferred already, and cash taken on top would be paid twice. Staying is the main
 * choice; taking the QR down is for a cashier who has looked at the bank's app.
 */
export function LeaveQrWhileOfflineSheet(props: { onChoose(takeDown: boolean): void }) {
  return (
    <section className="pos-card pos-confirm" role="alertdialog" aria-label={T.title}>
      <h2 className="pos-confirm__title">
        <Icon of={TriangleAlert} size={24} />
        {T.title}
      </h2>
      <p className="pos-wrap">{T.hint}</p>
      <div className="pos-confirm__actions">
        <button
          type="button"
          className="pos-button pos-button--primary"
          onClick={() => props.onChoose(false)}
        >
          {T.stay}
        </button>
        <button type="button" className="pos-button" onClick={() => props.onChoose(true)}>
          {T.go}
        </button>
      </div>
    </section>
  );
}
