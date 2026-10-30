import { formatVnd } from "@fnb/domain";
import { CircleCheck, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { PaidSale } from "../../features/printing/paid-sale";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { useCallNumber } from "../../features/order/device-order-number";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";
import { PrintedSlipList } from "./printed-slip-list";

const T = vi.checkout.done;

export interface SaleDoneScreenProps {
  header: ReactNode;
  sale: PaidSale;
  /** Null while the slips are still printing. */
  slips: readonly PrintedSlip[] | null;
  /** The sale's e-invoice, when the branch issues them. */
  invoice?: ReactNode;
  /** What the button after the sale says; a new order at the counter by default. */
  nextOrderLabel?: string;
  onNextOrder(): void;
}

/** The sale is recorded: the change to hand back, the call number, and each slip. */
export function SaleDoneScreen(props: SaleDoneScreenProps) {
  const { header, sale, slips, onNextOrder } = props;
  const { order, priced, change } = sale;
  const callNumberOf = useCallNumber();
  return (
    <ScreenFrame
      title={T.title}
      dock={
        <>
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--lg pos-button--block"
            onClick={onNextOrder}
          >
            <Icon of={Plus} size={24} />
            {props.nextOrderLabel ?? T.nextOrder}
          </button>
        </>
      }
    >
      {header}
      <section className="pos-card pos-done">
        <span className="pos-done__mark">
          <Icon of={CircleCheck} size={40} />
        </span>
        <p className="pos-call-number">
          {vi.sale.callNumber(callNumberOf(order.deviceOrderNo))}
          <span className="pos-hint"> · {vi.sale.orderNumber(order.deviceOrderNo)}</span>
        </p>
        <p className="pos-done__paid">{T.paid(formatVnd(priced.totals.amountDue))}</p>
        <p className="pos-done__change" data-change={String(change)} data-has-change={change > 0n}>
          {change === 0n ? T.noChange : T.change(formatVnd(change))}
        </p>
      </section>
      {props.invoice}
      <PrintedSlipList slips={slips} />
    </ScreenFrame>
  );
}
