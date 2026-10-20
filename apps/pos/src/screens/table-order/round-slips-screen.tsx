import type { ReactNode } from "react";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { vi } from "../../messages/vi";
import { PrintedSlipList } from "../payment/printed-slip-list";
import { Alert, ScreenFrame } from "../shared/screen-frame";

/** The slips of a round (kitchen tickets, a pre-bill) as they printed or only showed. */
export function RoundSlipsScreen(props: {
  header: ReactNode;
  title: string;
  /** Null while printing. */
  slips: readonly PrintedSlip[] | null;
  /** A word about the slips, e.g. the server has not heard of a cancel ticket yet. */
  notice?: string | undefined;
  /** What the button back says; back to the order unless told otherwise. */
  backLabel?: string;
  onBack(): void;
}) {
  const { slips } = props;
  return (
    <ScreenFrame title={props.title}>
      {props.header}
      <Alert message={props.notice ?? null} />
      <button
        type="button"
        className="pos-button pos-button--primary pos-cart__checkout"
        onClick={props.onBack}
      >
        {props.backLabel ?? vi.tables.slips.backToOrder}
      </button>
      {slips !== null && slips.length === 0 ? (
        <p className="pos-hint">{vi.tables.slips.noKitchenSlip}</p>
      ) : null}
      <PrintedSlipList slips={slips} />
    </ScreenFrame>
  );
}
