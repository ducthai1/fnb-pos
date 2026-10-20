import { formatVnd } from "@fnb/domain";
import type { ReactNode } from "react";
import type { PaidSale } from "../../features/printing/paid-sale";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { callNumberOf } from "../../features/order/device-order-number";
import { vi } from "../../messages/vi";
import { ScreenFrame } from "../shared/screen-frame";

const T = vi.checkout.done;

function slipStatus(slip: PrintedSlip): string {
  switch (slip.outcome.status) {
    case "preview_only":
      return T.previewOnly;
    case "printed":
      return T.printed;
    case "failed":
      return T.printFailed(slip.outcome.errorCode);
  }
}

export interface SaleDoneScreenProps {
  header: ReactNode;
  sale: PaidSale;
  /** Null while the slips are still printing. */
  slips: readonly PrintedSlip[] | null;
  onNextOrder(): void;
}

/** The sale is recorded: the change to hand back, the call number, and each slip. */
export function SaleDoneScreen({ header, sale, slips, onNextOrder }: SaleDoneScreenProps) {
  const { order, priced, change } = sale;
  return (
    <ScreenFrame title={T.title}>
      {header}
      <p className="pos-call-number">
        {vi.sale.callNumber(callNumberOf(order.deviceOrderNo))}
        <span className="pos-hint"> · {vi.sale.orderNumber(order.deviceOrderNo)}</span>
      </p>
      <p className="pos-due">{T.paid(formatVnd(priced.totals.amountDue))}</p>
      <p className="pos-total" data-change={String(change)}>
        {change === 0n ? T.noChange : T.change(formatVnd(change))}
      </p>
      <button
        type="button"
        className="pos-button pos-button--primary pos-cart__checkout"
        onClick={onNextOrder}
      >
        {T.nextOrder}
      </button>
      <section className="pos-slips" aria-label={T.slips}>
        {slips === null ? <p className="pos-hint">{T.printing}</p> : null}
        {(slips ?? []).map((slip) => (
          <article
            key={slip.job.jobId}
            className="pos-card pos-slip"
            data-print-status={slip.outcome.status}
          >
            <h2 className="pos-slip__title">{T.slipNames[slip.job.kind]}</h2>
            <p className="pos-hint pos-wrap">{slipStatus(slip)}</p>
            <pre className="pos-slip__preview">{slip.job.preview}</pre>
          </article>
        ))}
      </section>
    </ScreenFrame>
  );
}
