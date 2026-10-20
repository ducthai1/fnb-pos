import { formatVnd, negateVnd } from "@fnb/domain";
import type { CartView } from "../../features/order/cart-view";
import { vi } from "../../messages/vi";
import { Alert } from "../shared/screen-frame";

const S = vi.sale;

/** The domain's totals of the cart, or nothing while it cannot be priced. */
export function CartTotals({ view }: { view: CartView }) {
  if (view.kind === "unpriceable") return <Alert message={view.message} />;
  const { totals } = view.priced;
  return (
    <dl className="pos-totals">
      <dt>{S.subtotal}</dt>
      <dd>{formatVnd(totals.grossTotal)}</dd>
      {totals.discountTotal === 0n ? null : (
        <>
          <dt>{vi.adjust.cart.orderDiscount}</dt>
          <dd data-discount-total={String(totals.discountTotal)}>
            {formatVnd(negateVnd(totals.discountTotal))}
          </dd>
        </>
      )}
      {totals.serviceCharge === 0n ? null : (
        <>
          <dt>{S.serviceCharge}</dt>
          <dd>{formatVnd(totals.serviceCharge)}</dd>
        </>
      )}
      <dt>{view.pricesIncludeTax ? S.taxIncluded : S.taxAdded}</dt>
      <dd>{formatVnd(totals.taxTotal)}</dd>
      <dt className="pos-totals__due">{S.amountDue}</dt>
      <dd className="pos-totals__due" data-amount-due={String(totals.amountDue)}>
        {formatVnd(totals.amountDue)}
      </dd>
    </dl>
  );
}
