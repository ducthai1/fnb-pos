"use client";

import { Check, ChevronDown, type LucideIcon, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { vi } from "../../messages/vi";
import { Icon } from "./icon";
import { type ListboxChoice, SEARCH_FROM_CHOICES, filterChoices, matchTyped, stepFor } from "./listbox-keys";

export type { ListboxChoice } from "./listbox-keys";

/**
 * A picker drawn in the app's own look instead of the system's list (whose blue highlight
 * clashes with the page): a button that names the choice, and a list that drops under it.
 * It follows the "select-only combobox" of WAI-ARIA: the focus stays on the button, the
 * arrows, Home and End walk the list (opening it first), Enter or Space picks, Esc closes,
 * typing a letter jumps to a choice; a click outside or Tab closes it without a change.
 *
 * A long list (or one the caller asks) also has a search box that takes the focus when the
 * list opens: what is typed narrows the choices ignoring tone marks, đ and case ("tra sua"
 * finds "Trà sữa"), the arrows walk what is left, Enter picks, Esc closes and gives the
 * focus back to the button.
 */
export function Listbox({
  label,
  hideLabel = false,
  value,
  choices,
  onChange,
  icon,
  iconOnly = false,
  searchable,
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
  /** Force the search box on or off; by default it shows for lists longer than a screenful. */
  searchable?: boolean | undefined;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const withSearch = searchable ?? choices.length > SEARCH_FROM_CHOICES;
  const shown = withSearch ? filterChoices(choices, query) : choices;
  const selectedAt = Math.max(
    choices.findIndex((choice) => choice.value === value),
    0,
  );
  const selected = choices[selectedAt];
  const activeId = open && shown.length > 0 ? `${id}-option-${active}` : undefined;

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
  }, [open, active, id, shown.length]);

  // The search box takes the focus as the list opens, so what the person types lands in it.
  useEffect(() => {
    if (open && withSearch) search.current?.focus();
  }, [open, withSearch]);

  function show(at: number, from = "") {
    setQuery(from);
    setActive(at);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
    // The search box is leaving; the button is what the person opened the list from.
    if (document.activeElement === search.current) button.current?.focus();
  }

  function pick(at: number) {
    const choice = shown[at];
    // Nothing found: Enter leaves the list open for the person to fix what they typed.
    if (choice === undefined) return;
    close();
    if (choice.value !== value) onChange(choice.value);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (key === "Escape" && open) {
      event.preventDefault();
      return close();
    }
    if (key === "Tab") return close();
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      return open ? pick(active) : show(selectedAt);
    }
    const step = stepFor(key, open ? active : selectedAt, shown.length);
    if (step !== null) {
      event.preventDefault();
      // Closed, an arrow only opens the list on the current choice; open, it walks.
      return show(!open && (key === "ArrowDown" || key === "ArrowUp") ? selectedAt : step);
    }
    if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (withSearch) {
        // The first letter opens the list already searching for it.
        event.preventDefault();
        return show(0, key);
      }
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

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    const { key } = event;
    // A syllable still being composed (Telex) uses Enter and the arrows for itself.
    if (event.nativeEvent.isComposing) return;
    if (key === "Escape") {
      event.preventDefault();
      return close();
    }
    if (key === "Tab") return close();
    if (key === "Enter") {
      event.preventDefault();
      return pick(active);
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      setActive(stepFor(key, active, shown.length) ?? 0);
    }
  }

  return (
    <div ref={root} className={`bo-listbox ${className ?? ""}`} data-open={open ? "" : undefined}>
      <span id={`${id}-label`} className={hideLabel ? "bo-sr-only" : "bo-listbox__label"}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        role="combobox"
        className="bo-listbox__button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={withSearch ? undefined : activeId}
        title={iconOnly ? label : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show(selectedAt))}
        onKeyDown={onKey}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node | null)) close();
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
        <div className="bo-listbox__popup" tabIndex={-1}>
          {withSearch && (
            <label className="bo-listbox__search">
              <Icon of={Search} size={16} />
              <input
                ref={search}
                type="text"
                role="searchbox"
                className="bo-listbox__search-input"
                aria-label={`${vi.common.listSearch}: ${label}`}
                aria-controls={`${id}-list`}
                aria-activedescendant={activeId}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={vi.common.listSearch}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                onBlur={(event) => {
                  if (!root.current?.contains(event.relatedTarget as Node | null)) close();
                }}
              />
            </label>
          )}
          <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="bo-listbox__list">
            {shown.map((choice, at) => (
              <li
                key={choice.value}
                id={`${id}-option-${at}`}
                role="option"
                aria-selected={choice.value === selected?.value}
                className="bo-listbox__option"
                data-active={at === active ? "" : undefined}
                onPointerEnter={() => setActive(at)}
                // The focus stays where it is (button or search box), so the list stays open.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pick(at)}
              >
                {choice.lead}
                <span className="bo-wrap bo-listbox__text">{choice.label}</span>
                {choice.value === selected?.value && <Icon of={Check} size={16} />}
              </li>
            ))}
          </ul>
          {shown.length === 0 && (
            <p className="bo-listbox__empty" role="status">
              {vi.common.listNoMatch}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
