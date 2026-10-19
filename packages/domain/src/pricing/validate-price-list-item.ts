import { DomainError } from "../errors";
import type { PriceListItem } from "./price-list-types";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";

const MINUTES_PER_DAY = 1440;

/**
 * Rejects a price list item that could never apply, or that would apply in a
 * way nobody meant. The backoffice runs it on save; resolveUnitPrice runs it on
 * every item it is given, so a bad item fails loudly instead of silently pricing
 * some orders wrong at the one hour it happens to match.
 */
export function validatePriceListItem(item: PriceListItem): void {
  const fail = (code: string, message: string, details: Record<string, unknown> = {}): never => {
    throw new DomainError(code, `price list item ${item.id}: ${message}`, {
      priceListItemId: item.id,
      ...details,
    });
  };

  if (item.effect.kind === "fixed_price") {
    // One fixed price for a whole category or menu flattens items that cost
    // different amounts; such rules are expressed as a percentage instead.
    if (item.scope.kind === "category" || item.scope.kind === "global") {
      fail(
        PRICING_ERROR_CODES.fixedPriceOnBroadScope,
        "a fixed price needs a variant or product scope",
        {
          scope: item.scope.kind,
        },
      );
    }
    if (item.effect.price < 0n) {
      fail(PRICING_ERROR_CODES.negativeFixedPrice, "a fixed price cannot be negative");
    }
  }

  const { validFrom, validTo } = item;
  if (
    (validFrom !== null && !Number.isSafeInteger(validFrom)) ||
    (validTo !== null && !Number.isSafeInteger(validTo)) ||
    (validFrom !== null && validTo !== null && validFrom >= validTo)
  ) {
    fail(PRICING_ERROR_CODES.invalidValidityRange, "validFrom must be before validTo", {
      validFrom,
      validTo,
    });
  }

  const days = item.daysOfWeek;
  if (
    days !== null &&
    (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    // An empty list would mean "never", which is a mistake rather than a schedule.
    fail(PRICING_ERROR_CODES.invalidDaysOfWeek, "days must be 0 (Sunday) to 6, at least one", {
      daysOfWeek: days,
    });
  }

  const window = item.timeWindow;
  if (window !== null) {
    const { startMinute, endMinute } = window;
    const startValid =
      Number.isInteger(startMinute) && startMinute >= 0 && startMinute < MINUTES_PER_DAY;
    const endValid = Number.isInteger(endMinute) && endMinute >= 0 && endMinute <= MINUTES_PER_DAY;
    // start === end is refused: it could mean "all day" or "never", and both are better said otherwise.
    if (!startValid || !endValid || startMinute === endMinute) {
      fail(
        PRICING_ERROR_CODES.invalidTimeWindow,
        "time window must be distinct minutes of the day",
        {
          startMinute,
          endMinute,
        },
      );
    }
  }

  if (!Number.isSafeInteger(item.priority)) {
    fail(PRICING_ERROR_CODES.invalidPriority, "priority must be a whole number", {
      priority: item.priority,
    });
  }
}
