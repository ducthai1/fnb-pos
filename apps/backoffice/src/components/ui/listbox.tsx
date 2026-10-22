"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";

export interface ListboxChoice {
  readonly value: string;
  readonly label: string;
  /** Drawn before the label in the list, such as the swatch of a look. */
  readonly lead?: ReactNode;
}

/** The choice a key moves to from `at` in a list of `count`, or null for a key that does not move. */
export function stepFor(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return Math.min(at + 1, count - 1);
  if (key === "ArrowUp") return Math.max(at - 1, 0);
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return count - 1;
  return null;
}

/** The first choice after `at` whose label starts with what was typed, wrapping; -1 if none. */
export function matchTyped(choices: readonly ListboxChoice[], typed: string, at: number): number {
  const wanted = typed.toLocaleLowerCase("vi");
  for (let step = 1; step <= choices.length; step += 1) {
    const index = (at + step) % choices.length;
    if (choices[index]?.label.toLocaleLowerCase("vi").startsWith(wanted)) return index;
  }
  return -1;
}

/**
 * A picker drawn in the app's own look instead of the system's list (whose blue highlight
 * clashes with the page): a button that names the choice, and a list that drops under it.
 * It follows the "select-only combobox" of WAI-ARIA: the focus stays on the button, the
 * arrows, Home and End walk the list (opening it first), Enter or Space picks, Esc closes,
 * typing a letter jumps to a choice; a click outside or Tab closes it without a change.
 */
export function Listbox({
  label,
  hideLabel = false,
  value,
  choices,
  onChange,
  icon,
  iconOnly = false,
  disabled,
  className,
}: {
  label: string;
  /** The name is said, not shown: the bar's branch picker, the pager's size. */
  hideLabel?: boolean;
  value: string;
  choices: readonly ListboxChoice[];
  onChange: (value: string) => void;
  icon?: LucideIcon;
  /** The button is the icon alone (the bar's look picker); the label is its name and tooltip. */
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedAt = Math.max(
    choices.findIndex((choice) => choice.value === value),
    0,
  );
  const selected = choices[selectedAt];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  function show(at: number) {
    setActive(at);
    setOpen(true);
  }

  function pick(at: number) {
    const choice = choices[at];
    setOpen(false);
    if (choice !== undefined && choice.value !== value) onChange(choice.value);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (key === "Escape" && open) {
      event.preventDefault();
      return setOpen(false);
    }
    if (key === "Tab") return setOpen(false);
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      return open ? pick(active) : show(selectedAt);
    }
    const step = stepFor(key, open ? active : selectedAt, choices.length);
    if (step !== null) {
      event.preventDefault();
      // Closed, an arrow only opens the list on the current choice; open, it walks.
      return show(!open && (key === "ArrowDown" || key === "ArrowUp") ? selectedAt : step);
    }
    if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = event.timeStamp;
      const run = typed.current;
      run.text = now - run.at < 700 ? run.text + key : key;
      run.at = now;
      const from = open ? active : selectedAt;
      // A run of letters keeps refining from the same choice; one letter again moves on.
      const found = matchTyped(choices, run.text, run.text.length > 1 ? from - 1 : from);
      if (found >= 0) show(found);
    }
  }

  return (
    <div ref={root} className={`bo-listbox ${className ?? ""}`} data-open={open ? "" : undefined}>
      <span id={`${id}-label`} className={hideLabel ? "bo-sr-only" : "bo-listbox__label"}>
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        className="bo-listbox__button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        title={iconOnly ? label : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show(selectedAt))}
        onKeyDown={onKey}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        {icon !== undefined && <Icon of={icon} size={iconOnly ? 20 : 18} />}
        {!iconOnly && (
          <>
            <span className="bo-listbox__value bo-clip">{selected?.label ?? ""}</span>
            <Icon of={ChevronDown} size={18} />
          </>
        )}
      </button>
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="bo-listbox__popup" tabIndex={-1}>
          {choices.map((choice, at) => (
            <li
              key={choice.value}
              id={`${id}-option-${at}`}
              role="option"
              aria-selected={at === selectedAt}
              className="bo-listbox__option"
              data-active={at === active ? "" : undefined}
              onPointerEnter={() => setActive(at)}
              // The button keeps the focus, so the list stays open while the choice is made.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(at)}
            >
              {choice.lead}
              <span className="bo-wrap bo-listbox__text">{choice.label}</span>
              {at === selectedAt && <Icon of={Check} size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
