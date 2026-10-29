import type { WalletKey } from "@fnb/contracts";
import { Banknote, Check, type LucideIcon, QrCode, Smartphone } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

/** The way the customer pays this time: cash, a transfer to the QR, or an e-wallet. */
export type PayWay = "cash" | "qr" | WalletKey;

export const isWalletWay = (way: PayWay): way is WalletKey => way !== "cash" && way !== "qr";

const BASE_WAYS: readonly { way: PayWay; label: string; glyph: LucideIcon }[] = [
  { way: "cash", label: vi.checkout.payment.cash, glyph: Banknote },
  { way: "qr", label: vi.qr.title, glyph: QrCode },
];

/**
 * Big cards, one chosen: cash and the QR always, then a card for each e-wallet the branch
 * turned on. What the drawer shows under them follows the choice.
 */
export function PaymentMethodCards({
  chosen,
  disabled,
  wallets = [],
  onChoose,
}: {
  chosen: PayWay;
  disabled: boolean;
  wallets?: readonly WalletKey[];
  onChoose(way: PayWay): void;
}) {
  const ways = [
    ...BASE_WAYS,
    ...wallets.map((wallet) => ({
      way: wallet,
      label: vi.wallet.names[wallet] ?? wallet,
      glyph: Smartphone,
    })),
  ];
  return (
    <div className="pos-pay-ways" role="group" aria-label={vi.checkout.payment.ways}>
      {ways.map(({ way, label, glyph }) => (
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
          <span className="pos-pay-way__glyph" aria-hidden="true">
            <Icon of={glyph} size={30} />
          </span>
          <span className="pos-pay-way__label">{label}</span>
          {/* Drawn only on the chosen card: the choice is seen without relying on colour. */}
          <span className="pos-pay-way__tick" aria-hidden="true">
            <Icon of={Check} size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}
