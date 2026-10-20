import type { ReactNode } from "react";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { vi } from "../../messages/vi";
import { PrintedSlipList } from "../payment/printed-slip-list";
import { ScreenFrame } from "../shared/screen-frame";

/** The slips of a round (kitchen tickets, a pre-bill) as they printed or only showed. */
export function RoundSlipsScreen(props: {
  header: ReactNode;
  title: string;
  /** Null while printing. */
  slips: readonly PrintedSlip[] | null;
  onBack(): void;
}) {
  const { slips } = props;
  return (
    <ScreenFrame title={props.title}>
      {props.header}
      <button
        type="button"
        className="pos-button pos-button--primary pos-cart__checkout"
        onClick={props.onBack}
      >
        {vi.tables.slips.backToOrder}
      </button>
      {slips !== null && slips.length === 0 ? (
        <p className="pos-hint">{vi.tables.slips.noKitchenSlip}</p>
      ) : null}
      <PrintedSlipList slips={slips} />
    </ScreenFrame>
  );
}
