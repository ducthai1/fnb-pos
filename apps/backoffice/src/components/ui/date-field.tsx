"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { todaysBusinessDate } from "../../lib/format/business-day";
import {
  dayMonthYear,
  monthTitle,
  monthWeeks,
  parseDayMonthYear,
  shiftDays,
  shiftMonths,
} from "../../lib/format/calendar-days";
import { usePresence } from "../../lib/motion/use-presence";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { FieldError } from "./text-field";

const T = vi.dateField;

/** The day a key moves the calendar's focus to; null for a key that does not move it. */
function movedTo(day: string, key: string): string | null {
  switch (key) {
    case "ArrowLeft":
      return shiftDays(day, -1);
    case "ArrowRight":
      return shiftDays(day, 1);
    case "ArrowUp":
      return shiftDays(day, -7);
    case "ArrowDown":
      return shiftDays(day, 7);
    case "PageUp":
      return shiftMonths(day, -1);
    case "PageDown":
      return shiftMonths(day, 1);
    default:
      return null;
  }
}

/**
 * A day to give, in the app's own look instead of the system's date box (which writes the day
 * as the browser's language does: "10/30/2026" for 30 October): a box that takes the day typed
 * as dd/mm/yyyy, and a calendar that drops under it from the button beside it. The pages keep
 * "YYYY-MM-DD"; `onChange` is told only of a real day inside `min`..`max`, or "" once the
 * box is emptied. What cannot be read stays in the box with its reason until fixed or left.
 * The calendar follows the "dialog + grid" of WAI-ARIA: the arrows walk days and weeks, Page
 * Up / Down months, Enter or Space picks, Esc closes and gives the focus back to the box.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest day that can be given ("YYYY-MM-DD"). */
  min?: string | undefined;
  max?: string | undefined;
  error?: string | undefined;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => dayMonthYear(value));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const { present, leaving } = usePresence(open, "--t-exit");
  const today = todaysBusinessDate();
  const inRange = (day: string) =>
    (min === undefined || day >= min) && (max === undefined || day <= max);

  // The page changed the day (a range button, the arrows of a day picker): the box follows.
  useEffect(() => {
    setDraft(dayMonthYear(value));
    setProblem(undefined);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // The day the keys are on takes the focus as the calendar opens and as it moves.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>("button[tabindex='0']")?.focus();
  }, [open, focused]);

  function give(day: string) {
    setProblem(undefined);
    setDraft(dayMonthYear(day));
    if (day !== value) onChange(day);
  }

  function why(text: string): string | undefined {
    const day = parseDayMonthYear(text);
    if (day === null) return T.notADay;
    if (max !== undefined && day > max) return T.tooLate(dayMonthYear(max));
    if (min !== undefined && day < min) return T.tooEarly(dayMonthYear(min));
    return undefined;
  }

  function typed(text: string) {
    setDraft(text);
    if (text.trim() === "") {
      // Emptied: no day is given, which the page says in its own words.
      setProblem(undefined);
      if (value !== "") onChange("");
      return;
    }
    const day = parseDayMonthYear(text);
    if (day !== null && why(text) === undefined) {
      setProblem(undefined);
      if (day !== value) onChange(day);
    }
  }

  function left() {
    setProblem(draft.trim() === "" ? undefined : why(draft));
  }

  function show() {
    setFocused(
      inRange(value) && value !== "" ? value : max !== undefined && today > max ? max : today,
    );
    setOpen(true);
  }

  function close(back: boolean) {
    setOpen(false);
    if (back) button.current?.focus();
  }

  function onCalendarKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      return close(true);
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const week = monthWeeks(focused).find((days) => days.includes(focused));
      const edge = event.key === "Home" ? week?.[0] : week?.[6];
      if (edge !== undefined) setFocused(edge);
      return;
    }
    const next = movedTo(focused, event.key);
    if (next === null) return;
    event.preventDefault();
    // A key never walks to a day that cannot be given: the focus stays at the edge.
    if (inRange(next)) setFocused(next);
  }

  const shownError = problem ?? error;
  const errorId = `${id}-error`;
  const weeks = monthWeeks(focused);
  const showing = focused.slice(0, 7);

  return (
    <div
      ref={root}
      className={`bo-field bo-date-field ${className ?? ""}`}
      data-open={open ? "" : undefined}
    >
      <label htmlFor={id}>{label}</label>
      <div className="bo-date-field__box">
        <input
          ref={input}
          id={id}
          className="bo-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={T.placeholder}
          maxLength={10}
          value={draft}
          aria-invalid={shownError === undefined ? undefined : true}
          aria-describedby={shownError === undefined ? undefined : errorId}
          onChange={(event) => typed(event.target.value)}
          onBlur={left}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              show();
            }
          }}
        />
        <button
          ref={button}
          type="button"
          className="bo-date-field__open"
          aria-label={`${T.openCalendar}: ${label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close(false) : show())}
        >
          <Icon of={CalendarDays} size={18} />
        </button>
      </div>
      <FieldError id={errorId} message={shownError} />
      {present && (
        <div
          className="bo-date-field__popup"
          role="dialog"
          aria-label={`${T.calendar}: ${label}`}
          data-leaving={leaving ? "" : undefined}
          inert={leaving}
          onKeyDown={onCalendarKey}
        >
          <div className="bo-date-field__head">
            <button
              type="button"
              className="bo-icon-button"
              aria-label={T.previousMonth}
              disabled={min !== undefined && `${showing}-01` <= min}
              onClick={() => setFocused(shiftMonths(focused, -1))}
            >
              <Icon of={ChevronLeft} />
            </button>
            <strong className="bo-date-field__title" aria-live="polite">
              {monthTitle(focused)}
            </strong>
            <button
              type="button"
              className="bo-icon-button"
              aria-label={T.nextMonth}
              disabled={max !== undefined && shiftMonths(`${showing}-01`, 1) > max}
              onClick={() => setFocused(shiftMonths(focused, 1))}
            >
              <Icon of={ChevronRight} />
            </button>
          </div>
          <div className="bo-date-field__week" aria-hidden="true">
            {T.weekdays.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <div
            ref={grid}
            className="bo-date-field__grid"
            role="group"
            aria-label={monthTitle(focused)}
          >
            {weeks.flat().map((day) => (
              <button
                key={day}
                type="button"
                className="bo-date-field__day"
                tabIndex={day === focused ? 0 : -1}
                aria-label={dayMonthYear(day)}
                aria-pressed={day === value}
                data-today={day === today ? "" : undefined}
                data-outside={day.slice(0, 7) === showing ? undefined : ""}
                disabled={!inRange(day)}
                onClick={() => {
                  give(day);
                  close(true);
                }}
              >
                {Number(day.slice(8, 10))}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bo-button bo-date-field__today"
            disabled={!inRange(today)}
            onClick={() => {
              give(today);
              close(true);
            }}
          >
            {T.today}
          </button>
        </div>
      )}
    </div>
  );
}
