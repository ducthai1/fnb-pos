"use client";

import { Palette } from "lucide-react";
import { THEME_CHOICES, type ThemeChoice, parseThemeChoice } from "../../lib/theme/theme-choice";
import { chooseTheme, useThemeChoice } from "../../lib/theme/theme-store";
import { vi } from "../../messages/vi";
import { Listbox, type ListboxChoice } from "../ui/listbox";

const T = vi.shell.theme;

const CHOICES: readonly ListboxChoice[] = THEME_CHOICES.map((choice: ThemeChoice) => ({
  value: choice,
  label: T.choices[choice],
  lead: <span className="bo-theme-swatch" data-swatch={choice} aria-hidden="true" />,
}));

/**
 * The look of the pages on this machine: in the bar a palette button beside the account,
 * at the drawer's foot a picker naming the look. Choosing applies at once, without a reload,
 * and is kept for the next visit in this browser.
 */
export function ThemePicker({ placement }: { placement: "bar" | "drawer" }) {
  const choice = useThemeChoice();
  const bar = placement === "bar";
  return (
    <Listbox
      label={T.label}
      hideLabel={bar}
      iconOnly={bar}
      icon={Palette}
      value={choice}
      choices={CHOICES}
      onChange={(value) => chooseTheme(parseThemeChoice(value))}
      className={bar ? "bo-theme-picker bo-listbox--end" : "bo-theme-picker bo-theme-picker--drawer bo-listbox--up"}
    />
  );
}
