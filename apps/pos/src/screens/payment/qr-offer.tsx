import { type Vnd, formatVnd } from "@fnb/domain";
import { QrCode } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const Q = vi.qr;

/**
 * The way to a VietQR for the whole amount due, or why there is none: the branch has no
 * account to receive into, or cash was already taken (a QR asks for exactly the order's
 * total, which the server checks, so it never pays a remainder).
 */
export function QrOffer({
  amountDue,
  accountSet,
  cashTaken,
  onShow,
}: {
  amountDue: Vnd;
  accountSet: boolean;
  cashTaken: boolean;
  onShow(): void;
}) {
  const unavailable = !accountSet ? Q.noAccount : cashTaken ? Q.wholeOrderOnly : null;
  return (
    <section className="pos-card pos-cash" aria-label={Q.title}>
      <h2 className="pos-card__title">
        <Icon of={QrCode} size={22} />
        {Q.title}
      </h2>
      {unavailable !== null ? (
        <p className="pos-hint pos-wrap" data-qr-unavailable>
          {unavailable}
        </p>
      ) : (
        <>
          <p className="pos-hint pos-wrap">{Q.offerHint}</p>
          <button type="button" className="pos-button pos-button--info pos-wrap" onClick={onShow}>
            <Icon of={QrCode} />
            {Q.offer(formatVnd(amountDue))}
          </button>
        </>
      )}
    </section>
  );
}
