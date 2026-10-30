import { BadgePercent, CircleMinus, Ellipsis, Replace, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.adjust.tools;

/** What can be done to a saved item beyond the stepper: void it, discount it. */
export interface LineAdjustments {
  onVoid(lineId: string): void;
  onDiscount(lineId: string): void;
  /**
   * Cancels a sent item and orders it again with other options, in one go; offered only on
   * the lines `canChangeOptions` allows.
   */
  onChangeOptions?: ((lineId: string) => void) | undefined;
  canChangeOptions?: ((lineId: string) => boolean) | undefined;
}

/** The "…" of a line: opens the line's own actions under it, closed by it or by Esc. */
export function LineMenuButton(props: {
  name: string;
  open: boolean;
  controls: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle(): void;
}) {
  return (
    <button
      ref={props.buttonRef}
      type="button"
      className="pos-button pos-button--quiet pos-cart-line__more"
      aria-label={T.lineMenu(props.name)}
      aria-expanded={props.open}
      aria-controls={props.controls}
      onClick={props.onToggle}
    >
      <Icon of={Ellipsis} />
    </button>
  );
}

/**
 * The line's actions, each named with the item so a screen reader says which line: take it
 * off while it is only a draft; void or discount it once the order is saved.
 */
export function LineTools(props: {
  id: string;
  name: string;
  lineId: string;
  onRemove?: (() => void) | undefined;
  adjust?: LineAdjustments | undefined;
}) {
  const { adjust, lineId, name } = props;
  return (
    <div className="pos-line-tools pos-cart-line__tools" id={props.id}>
      {props.onRemove === undefined ? null : (
        <button
          type="button"
          className="pos-button pos-button--quiet pos-button--sm pos-cart-line__remove"
          aria-label={vi.sale.remove(name)}
          onClick={props.onRemove}
        >
          <Icon of={Trash2} />
          {vi.sale.removeShort}
        </button>
      )}
      {adjust === undefined ? null : (
        <>
          {adjust.onChangeOptions !== undefined && adjust.canChangeOptions?.(lineId) === true ? (
            <button
              type="button"
              className="pos-button pos-button--quiet pos-button--sm"
              aria-label={T.changeOptions(name)}
              onClick={() => adjust.onChangeOptions?.(lineId)}
            >
              <Icon of={Replace} />
              {T.changeOptionsShort}
            </button>
          ) : null}
          <button
            type="button"
            className="pos-button pos-button--quiet pos-button--sm"
            aria-label={T.void(name)}
            onClick={() => adjust.onVoid(lineId)}
          >
            <Icon of={CircleMinus} />
            {T.voidShort}
          </button>
          <button
            type="button"
            className="pos-button pos-button--quiet pos-button--sm"
            aria-label={T.discount(name)}
            onClick={() => adjust.onDiscount(lineId)}
          >
            <Icon of={BadgePercent} />
            {T.discountShort}
          </button>
        </>
      )}
    </div>
  );
}
