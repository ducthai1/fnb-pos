import { fireEvent, screen, within } from "@testing-library/react";

/** Opens the picker the way a click does and returns the names of the choices it lists. */
export function openPicker(scope: HTMLElement | Document, name: string | RegExp): string[] {
  const box = within(scope instanceof Document ? scope.body : scope).getByRole("combobox", { name });
  if (box.getAttribute("aria-expanded") !== "true") fireEvent.click(box);
  return within(screen.getByRole("listbox")).queryAllByRole("option").map((option) => option.textContent ?? "");
}

/** Picks a choice of the app's own picker by the name it shows, as a person does with the pointer. */
export function pickFrom(scope: HTMLElement | Document, name: string | RegExp, choice: string | RegExp) {
  openPicker(scope, name);
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: choice }));
}
