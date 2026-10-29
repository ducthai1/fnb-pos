import { Check, Palette } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  THEME_CHOICES,
  type ThemeChoice,
  type TillTheme,
  theTillTheme,
} from "../../features/theme/till-theme";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { usePresence } from "../shared/use-leave-motion";

const T = vi.theme;

/** A small sample of a theme drawn with that theme's own colours; "system" shows both. */
function ThemeSwatch({ of }: { of: ThemeChoice }) {
  const samples = of === "system" ? (["pastel", "dark"] as const) : [of];
  return (
    <span className="pos-theme-swatch" aria-hidden="true">
      {samples.map((sample) => (
        <span key={sample} className="pos-theme-swatch__sample" data-theme-sample={sample} />
      ))}
    </span>
  );
}

/**
 * The palette button of the till's bar: a short list of looks with the current one ticked.
 * Choosing applies at once and is kept on this till. Arrow keys move, Esc closes back onto
 * the button, a tap outside closes.
 */
export function ThemeMenu({ theme = theTillTheme() }: { theme?: TillTheme }) {
  const choice = useSyncExternalStore(theme.subscribe, theme.choice);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  // The list stays, inert, while it plays its leaving movement.
  const { present, leaving } = usePresence(open, "--t-exit");

  useEffect(() => {
    if (!open) return undefined;
    list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const moveFocus = (event: KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (to !== undefined) {
      event.preventDefault();
      items[to]?.focus();
    }
  };

  return (
    <div className="pos-theme-menu" ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="pos-button pos-button--quiet pos-button--sm pos-theme-menu__open"
        aria-label={T.open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <Icon of={Palette} />
      </button>
      {present ? (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={T.menuLabel}
          className="pos-theme-menu__list"
          data-leaving={leaving ? "" : undefined}
          inert={leaving}
          onKeyDown={moveFocus}
        >
          {THEME_CHOICES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === choice}
              tabIndex={option === choice ? 0 : -1}
              className="pos-theme-menu__option"
              onClick={() => {
                theme.choose(option);
                close();
              }}
            >
              <ThemeSwatch of={option} />
              <span className="pos-theme-menu__words">
                <span className="pos-theme-menu__name">{T.names[option]}</span>
                <span className="pos-theme-menu__hint">{T.hints[option]}</span>
              </span>
              <span className="pos-theme-menu__tick" aria-hidden="true">
                {option === choice ? <Icon of={Check} /> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
