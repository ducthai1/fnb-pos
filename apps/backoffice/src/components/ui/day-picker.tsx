"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dayAfter,
  dayBefore,
  isCalendarDate,
  todaysBusinessDate,
} from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { DateField } from "./date-field";

const T = vi.dayPicker;

/**
 * A business day to look at: the date field (typed as dd/mm/yyyy or picked on a calendar), a
 * step back, a step on (not past today) and a way back to today. The field alone still takes
 * any day up to today.
 */
export function DayPicker({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const today = todaysBusinessDate();
  const valid = isCalendarDate(value);
  return (
    <div className="bo-day-picker">
      <button
        type="button"
        className="bo-icon-button"
        aria-label={T.previous}
        disabled={!valid}
        onClick={() => onChange(dayBefore(value))}
      >
        <Icon of={ChevronLeft} />
      </button>
      <DateField label={label} value={value} max={today} error={error} onChange={onChange} />
      <button
        type="button"
        className="bo-icon-button"
        aria-label={T.next}
        disabled={!valid || value >= today}
        onClick={() => onChange(dayAfter(value))}
      >
        <Icon of={ChevronRight} />
      </button>
      <button
        type="button"
        className="bo-button"
        disabled={value === today}
        onClick={() => onChange(today)}
      >
        {T.today}
      </button>
    </div>
  );
}
