import { ArrowLeft, ChefHat, Printer } from "lucide-react";
import type { ReactNode } from "react";
import type { PrintedSlip } from "../../features/printing/print-sale-slips";
import { vi } from "../../messages/vi";
import { PrintedSlipList } from "../payment/printed-slip-list";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { EmptyState } from "../shared/state-view";

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
  /** A second action beside going back, e.g. printing the official copy once it can be. */
  extra?: { readonly label: string; readonly disabled: boolean; onClick(): void } | undefined;
  onBack(): void;
}) {
  const { slips } = props;
  return (
    <ScreenFrame
      title={props.title}
      wide
      dock={
        <>
          {props.extra === undefined ? null : (
            <button
              type="button"
              className="pos-button pos-button--lg pos-button--block"
              disabled={props.extra.disabled}
              onClick={props.extra.onClick}
            >
              <Icon of={Printer} size={22} />
              {props.extra.label}
            </button>
          )}
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--lg pos-button--block"
            onClick={props.onBack}
          >
            <Icon of={ArrowLeft} size={22} />
            {props.backLabel ?? vi.tables.slips.backToOrder}
          </button>
        </>
      }
    >
      {props.header}
      <Alert message={props.notice ?? null} />
      {slips !== null && slips.length === 0 ? (
        <EmptyState icon={ChefHat} title={vi.tables.slips.noKitchenSlip} />
      ) : null}
      <PrintedSlipList slips={slips} />
    </ScreenFrame>
  );
}
