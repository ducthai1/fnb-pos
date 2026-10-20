import { type BasisPoints, percentRate } from "@fnb/domain";

const PERCENT = /^\d{1,3}(?:[.,]\d{1,2})?$/;

/**
 * A percentage typed by a person ("8", "12,5", "7.25") in basis points, or null when it is
 * not one or is past 100%. The domain does the conversion, so 12,5% is exactly 1250.
 */
export function parsePercentText(text: string): BasisPoints | null {
  const trimmed = text.trim();
  if (!PERCENT.test(trimmed)) return null;
  try {
    return percentRate(Number(trimmed.replace(",", ".")));
  } catch {
    return null;
  }
}
