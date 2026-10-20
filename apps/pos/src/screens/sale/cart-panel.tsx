import { type OrderLine, QUANTITY_SCALE, formatVnd, quantityToDecimalString } from "@fnb/domain";
import {
  type CartLine,
  type CounterOrder,
  MAX_LINE_QUANTITY,
} from "../../features/order/counter-order";
import { type CartView, lineAmountOf } from "../../features/order/cart-view";
import { callNumberOf } from "../../features/order/device-order-number";
import { vi } from "../../messages/vi";
import { Alert } from "../shared/screen-frame";
import { QuantityStepper } from "./quantity-stepper";
import { ServiceTypePicker } from "./service-type-picker";

const S = vi.sale;

export interface CartPanelProps {
  order: CounterOrder;
  view: CartView;
  onQuantity(lineId: string, quantity: number): void;
  onRemove(lineId: string): void;
  onServiceType(serviceType: CounterOrder["serviceType"], tableTag: string): void;
  onCheckout(): void;
}

/** The order as a tree (options indented under their item), with the domain's totals. */
export function CartPanel({ order, view, ...on }: CartPanelProps) {
  const priced = view.kind === "priced" ? view.priced : null;
  return (
    <section className="pos-cart" aria-label={S.cartLabel}>
      <p className="pos-cart__number">
        <strong>{S.orderNumber(order.deviceOrderNo)}</strong> ·{" "}
        {S.callNumber(callNumberOf(order.deviceOrderNo))}
      </p>
      <ServiceTypePicker order={order} onChange={on.onServiceType} />
      {order.lines.length === 0 ? <p className="pos-hint">{S.cartEmpty}</p> : null}
      <ul className="pos-list">
        {order.lines.map((line) => (
          <CartRow key={line.lineId} line={line} priced={priced?.lines ?? []} view={view} {...on} />
        ))}
      </ul>
      {view.kind === "unpriceable" ? <Alert message={view.message} /> : null}
      {priced === null ? null : (
        <dl className="pos-totals">
          <dt>{S.subtotal}</dt>
          <dd>{formatVnd(priced.totals.grossTotal)}</dd>
          {priced.totals.serviceCharge === 0n ? null : (
            <>
              <dt>{S.serviceCharge}</dt>
              <dd>{formatVnd(priced.totals.serviceCharge)}</dd>
            </>
          )}
          <dt>{view.pricesIncludeTax ? S.taxIncluded : S.taxAdded}</dt>
          <dd>{formatVnd(priced.totals.taxTotal)}</dd>
          <dt className="pos-totals__due">{S.amountDue}</dt>
          <dd className="pos-totals__due" data-amount-due={String(priced.totals.amountDue)}>
            {formatVnd(priced.totals.amountDue)}
          </dd>
        </dl>
      )}
      <button
        type="button"
        className="pos-button pos-button--primary pos-cart__checkout"
        disabled={priced === null || order.lines.length === 0}
        onClick={on.onCheckout}
      >
        {S.checkout}
      </button>
    </section>
  );
}

function CartRow(
  props: { line: CartLine; priced: readonly OrderLine[]; view: CartView } & Pick<
    CartPanelProps,
    "onQuantity" | "onRemove"
  >,
) {
  const { line, priced } = props;
  const item = priced.find((candidate) => candidate.id === line.lineId);
  const children = priced.filter((candidate) => candidate.parentLineId === line.lineId);
  const name = item?.nameSnapshot ?? props.view.nameOf(line);
  const amount = props.view.kind === "priced" ? lineAmountOf(props.view.priced, line.lineId) : null;
  return (
    <li className="pos-cart-line">
      <div className="pos-cart-line__head">
        <span className="pos-cart-line__name pos-wrap">{name}</span>
        <span className="pos-cart-line__amount">{amount === null ? "" : formatVnd(amount)}</span>
      </div>
      {children.length === 0 ? null : (
        <ul className="pos-cart-line__children">
          {children.map((child) => (
            <li key={child.id} className="pos-wrap">
              + {child.nameSnapshot}
              {child.quantity === QUANTITY_SCALE
                ? ""
                : ` ×${quantityToDecimalString(child.quantity)}`}
            </li>
          ))}
        </ul>
      )}
      {line.note === null ? null : (
        <p className="pos-cart-line__note pos-wrap">
          {S.note}: {line.note}
        </p>
      )}
      <div className="pos-cart-line__actions">
        <QuantityStepper
          label={S.lineQuantity(name)}
          name={name}
          value={line.quantity}
          max={MAX_LINE_QUANTITY}
          onChange={(next) => props.onQuantity(line.lineId, next)}
        />
        <button
          type="button"
          className="pos-button pos-button--quiet"
          aria-label={S.remove(name)}
          onClick={() => props.onRemove(line.lineId)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
