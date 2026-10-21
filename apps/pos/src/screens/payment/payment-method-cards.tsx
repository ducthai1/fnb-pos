import { Banknote, type LucideIcon, QrCode } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

/** The way the customer pays this time: cash on the counter, or a transfer to the QR. */
export type PayWay = "cash" | "qr";

const WAYS: readonly { way: PayWay; label: string; glyph: LucideIcon }[] = [
  { way: "cash", label: vi.checkout.payment.cash, glyph: Banknote },
  { way: "qr", label: vi.qr.title, glyph: QrCode },
];

/** Two big cards, one chosen: what the drawer shows under them follows the choice. */
export function PaymentMethodCards({
  chosen,
  disabled,
  onChoose,
}: {
  chosen: PayWay;
  disabled: boolean;
  onChoose(way: PayWay): void;
}) {
  return (
    <div className="pos-pay-ways" role="group" aria-label={vi.checkout.payment.ways}>
      {WAYS.map(({ way, label, glyph }) => (
        <button
          key={way}
          type="button"
          className="pos-pay-way"
          aria-pressed={chosen === way}
          data-pay-way={way}
          disabled={disabled}
          onClick={() => {
            if (chosen !== way) onChoose(way);
          }}
        >
          <Icon of={glyph} size={32} />
          <span className="pos-pay-way__label">{label}</span>
        </button>
      ))}
    </div>
  );
}
