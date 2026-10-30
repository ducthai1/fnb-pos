import { TriangleAlert } from "lucide-react";
import type { PreBillState } from "../../features/table-order/table-order-session";
import { refusalSentence, vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Presence } from "../shared/presence";
import { Alert } from "../shared/screen-frame";

const T = vi.tables.order;

export interface TableOrderNoticesProps {
  refusal: { readonly type: string; readonly code: string } | null;
  preBill: PreBillState;
  /** Units not sent to the kitchen while the cashier asked to leave; null: not leaving. */
  leavingWithUnsent: number | null;
  onStay(): void;
  onLeaveAnyway(): void;
}

/** What the cashier must know before going on with the order, most pressing first. */
export function TableOrderNotices(props: TableOrderNoticesProps) {
  const { refusal, preBill, leavingWithUnsent } = props;
  return (
    <>
      <Presence>
        {leavingWithUnsent === null ? null : (
        <section className="pos-card pos-confirm" role="alertdialog" aria-label={T.leaveTitle}>
          <h2 className="pos-confirm__title">
            <Icon of={TriangleAlert} size={24} />
            {T.leaveTitle}
          </h2>
          <p className="pos-wrap">{T.leaveHint(leavingWithUnsent)}</p>
          <div className="pos-confirm__actions">
            <button type="button" className="pos-button pos-button--primary" onClick={props.onStay}>
              {T.stay}
            </button>
            <button type="button" className="pos-button" onClick={props.onLeaveAnyway}>
              {T.leaveAnyway}
            </button>
          </div>
        </section>
        )}
      </Presence>
      <Presence>
        {refusal === null ? null : (
          <Alert message={`${refusalSentence(refusal.type, refusal.code)} ${T.blocked}`} />
        )}
      </Presence>
      <Presence>
        {preBill === "changed" ? (
          <p className="pos-alert pos-wrap" role="alert" data-pre-bill="changed">
            {T.changedAfterPreBill}
          </p>
        ) : null}
      </Presence>
      <Presence>
        {preBill === "current" ? (
          <p className="pos-notice" role="status" data-pre-bill="current">
            {T.preBillCurrent}
          </p>
        ) : null}
      </Presence>
    </>
  );
}
