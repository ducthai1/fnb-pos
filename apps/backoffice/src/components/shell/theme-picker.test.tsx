import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "../../lib/theme/theme-choice";
import { vi as text } from "../../messages/vi";
import { forgetScheme, schemeListenerCount, schemeOf, schemeTurns } from "../../test-support/color-scheme";
import { ThemePicker } from "./theme-picker";

const T = text.shell.theme;
const html = document.documentElement;

afterEach(() => {
  forgetScheme();
  window.localStorage.clear();
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-choice");
});

function openPicker() {
  const button = screen.getByRole("combobox", { name: T.label });
  fireEvent.click(button);
  return screen.getByRole("listbox", { name: T.label });
}

describe("the look picker in the bar", () => {
  it("is a palette button named Giao diện that lists the four looks, the current one ticked", () => {
    render(<ThemePicker placement="bar" />);
    const button = screen.getByRole("combobox", { name: T.label });
    expect(button.textContent).toBe("");
    const options = within(openPicker()).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Xanh pastel", "Rang xay", "Tối", "Theo máy"]);
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    expect(options.every((option) => option.querySelector(".bo-theme-swatch") !== null)).toBe(true);
  });

  it("applies a look at once and keeps it for the next visit", () => {
    render(<ThemePicker placement="bar" />);
    fireEvent.click(within(openPicker()).getByRole("option", { name: T.choices.dark }));
    expect(html.dataset).toMatchObject({ theme: "dark", themeChoice: "dark" });
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(within(openPicker()).getByRole("option", { name: T.choices.rangxay }));
    expect(html.dataset.theme).toBe("rangxay");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("rangxay");
    const ticked = within(openPicker()).getByRole("option", { selected: true });
    expect(ticked.textContent).toBe(T.choices.rangxay);
  });

  it("keeps the bar's picker and the drawer's in step", () => {
    render(
      <>
        <ThemePicker placement="bar" />
        <ThemePicker placement="drawer" />
      </>,
    );
    const [bar, drawer] = screen.getAllByRole("combobox", { name: T.label });
    expect(drawer!.textContent).toContain(T.choices.pastel);
    fireEvent.click(bar!);
    fireEvent.click(screen.getByRole("option", { name: T.choices.dark }));
    expect(drawer!.textContent).toContain(T.choices.dark);
  });

  it("on Theo máy follows the operating system as it turns, and stops once another look is chosen", () => {
    schemeOf(false);
    render(<ThemePicker placement="bar" />);
    fireEvent.click(within(openPicker()).getByRole("option", { name: T.choices.system }));
    expect(html.dataset).toMatchObject({ theme: "pastel", themeChoice: "system" });
    expect(window.localStorage.getItem(THEME_KEY)).toBe("system");

    act(() => schemeTurns(true));
    expect(html.dataset.theme).toBe("dark");
    act(() => schemeTurns(false));
    expect(html.dataset.theme).toBe("pastel");

    fireEvent.click(within(openPicker()).getByRole("option", { name: T.choices.rangxay }));
    act(() => schemeTurns(true));
    expect(html.dataset.theme).toBe("rangxay");
  });

  it("follows a look chosen in another tab of the same machine", () => {
    render(<ThemePicker placement="bar" />);
    act(() => {
      window.localStorage.setItem(THEME_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
    });
    expect(html.dataset.theme).toBe("dark");
    expect(within(openPicker()).getByRole("option", { selected: true }).textContent).toBe(T.choices.dark);
  });

  it("stops listening to the system when the last picker leaves the page", () => {
    schemeOf(false);
    const { unmount } = render(<ThemePicker placement="bar" />);
    expect(schemeListenerCount()).toBe(1);
    unmount();
    expect(schemeListenerCount()).toBe(0);
  });
});
