import {
  type BasisPoints,
  type LocalClockParts,
  type Quantity,
  type Vnd,
  formatVnd,
  quantityToDecimalString,
} from "@fnb/domain";

const two = (n: number) => String(n).padStart(2, "0");

/** "14:05" */
export function formatTimeOfDay(parts: Pick<LocalClockParts, "minuteOfDay">): string {
  return `${two(Math.floor(parts.minuteOfDay / 60))}:${two(parts.minuteOfDay % 60)}`;
}

/** "20/10/2026 14:05", the order Vietnamese readers expect. */
export function formatClock(parts: LocalClockParts): string {
  return `${two(parts.day)}/${two(parts.month)}/${parts.year} ${formatTimeOfDay(parts)}`;
}

/** "2", "0,5": a decimal comma, as everywhere else on a Vietnamese slip. */
export function formatQuantity(quantity: Quantity): string {
  return quantityToDecimalString(quantity).replace(".", ",");
}

/** 800 → "8%", 1050 → "10,5%". */
export function formatRate(rate: BasisPoints): string {
  const whole = Math.trunc(rate / 100);
  const fraction = String(rate % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction === "" ? `${whole}%` : `${whole},${fraction}%`;
}

/** A difference reads as one only with its sign: "+50.000 ₫" over, "-20.000 ₫" short. */
export function formatSignedVnd(amount: Vnd): string {
  return amount > 0n ? `+${formatVnd(amount)}` : formatVnd(amount);
}
