import QRCode from "qrcode";
import { useMemo } from "react";

/** Light modules around the symbol, as the QR standard asks, so a phone finds its edges. */
const QUIET_ZONE = 4;

/** The dark modules of `text`'s QR symbol as one SVG path, in module units. */
export function qrModulePath(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column) === 1) {
        parts.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }
  return { size: modules.size + 2 * QUIET_ZONE, d: parts.join("") };
}

/**
 * The QR symbol of `text`, drawn as SVG on the till: it stays sharp at any size and needs
 * no network. The encoded text sits on the element too, so a test can read what it says.
 */
export function QrCodeImage({ text, label }: { text: string; label: string }) {
  const symbol = useMemo(() => qrModulePath(text), [text]);
  return (
    <svg
      className="pos-qr-image"
      viewBox={`0 0 ${symbol.size} ${symbol.size}`}
      role="img"
      aria-label={label}
      data-qr-text={text}
      shapeRendering="crispEdges"
    >
      <rect width={symbol.size} height={symbol.size} fill="#ffffff" />
      <path d={symbol.d} fill="#000000" />
    </svg>
  );
}
