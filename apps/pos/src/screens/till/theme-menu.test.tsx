import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, type TillTheme, startTillTheme } from "../../features/theme/till-theme";
import { vi as text } from "../../messages/vi";
import { ThemeMenu } from "./theme-menu";

let theme: TillTheme;

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  theme = startTillTheme({ root: document.documentElement, storage: () => window.localStorage });
});

afterEach(() => theme.stop());

const openMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: text.theme.open }));
  return screen.getByRole("menu", { name: text.theme.menuLabel });
};

describe("choosing the till's look from its bar", () => {
  it("opens from the palette button, closed until then", () => {
    render(<ThemeMenu theme={theme} />);
    const button = screen.getByRole("button", { name: text.theme.open });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("lists the four looks in order with the current one ticked (the soft blue at first)", () => {
    render(<ThemeMenu theme={theme} />);
    const options = within(openMenu()).getAllByRole("menuitemradio");
    expect(options.map((option) => option.textContent)).toEqual([
      `${text.theme.names.pastel}${text.theme.hints.pastel}`,
      `${text.theme.names.rangxay}${text.theme.hints.rangxay}`,
      `${text.theme.names.dark}${text.theme.hints.dark}`,
      `${text.theme.names.system}${text.theme.hints.system}`,
    ]);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(document.activeElement).toBe(options[0]);
  });

  it("applies a look at once, keeps it on this till and closes back onto the button", () => {
    render(<ThemeMenu theme={theme} />);
    fireEvent.click(within(openMenu()).getByRole("menuitemradio", { name: /^Tối/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: text.theme.open }));
    const options = within(openMenu()).getAllByRole("menuitemradio");
    expect(options[2]!.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /^Rang xay/ }));
    expect(document.documentElement.dataset.theme).toBe("rangxay");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("rangxay");
  });

  it("keeps 'follow the device' as the choice and shows what it resolves to", () => {
    render(<ThemeMenu theme={theme} />);
    fireEvent.click(within(openMenu()).getByRole("menuitemradio", { name: /^Theo máy/ }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    // jsdom has no colour setting: a device that says nothing counts as light.
    expect(document.documentElement.dataset.theme).toBe("pastel");
  });

  it("moves with the arrow keys and closes on Esc without choosing", () => {
    render(<ThemeMenu theme={theme} />);
    const menu = openMenu();
    const options = within(menu).getAllByRole("menuitemradio");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(options[3]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(options[3]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("pastel");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: text.theme.open }));
  });

  it("closes on a tap outside it", () => {
    render(
      <>
        <ThemeMenu theme={theme} />
        <p>outside</p>
      </>,
    );
    openMenu();
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ticks a look chosen elsewhere on this page", () => {
    render(<ThemeMenu theme={theme} />);
    act(() => theme.choose("rangxay"));
    const options = within(openMenu()).getAllByRole("menuitemradio");
    expect(options[1]!.getAttribute("aria-checked")).toBe("true");
  });
});
