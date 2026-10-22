import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { forgetScheme, schemeOf, schemeTurns } from "../../test-support/color-scheme";
import {
  THEME_BAR_COLOUR,
  THEME_BOOT_SCRIPT,
  THEME_CHOICES,
  THEME_KEY,
  applyThemeChoice,
  readThemeChoice,
  resolveTheme,
  systemPrefersDark,
  watchSystemScheme,
  writeThemeChoice,
} from "./theme-choice";

const html = document.documentElement;
afterEach(() => {
  forgetScheme();
  window.localStorage.clear();
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-choice");
  document.querySelector('meta[name="theme-color"]')?.remove();
});

const refusing = () => {
  throw new DOMException("blocked", "SecurityError");
};
const memory = (value: string | null) => ({ getItem: () => value, setItem: () => undefined });

describe("the look kept on this machine", () => {
  it("reads each known choice back as itself", () => {
    for (const choice of THEME_CHOICES) {
      expect(writeThemeChoice(() => window.localStorage, choice)).toBe(true);
      expect(window.localStorage.getItem(THEME_KEY)).toBe(choice);
      expect(readThemeChoice(() => window.localStorage)).toBe(choice);
    }
  });

  it("means the soft blue default when nothing, or something unknown, is kept", () => {
    expect(readThemeChoice(() => memory(null))).toBe("pastel");
    for (const stranger of ["", "Dark", "light", "rang-xay", "{}", "system "]) {
      expect(readThemeChoice(() => memory(stranger))).toBe("pastel");
    }
  });

  it("survives a browser that refuses its storage, to read or to write", () => {
    expect(readThemeChoice(refusing)).toBe("pastel");
    expect(readThemeChoice(() => ({ getItem: refusing }))).toBe("pastel");
    expect(writeThemeChoice(refusing, "dark")).toBe(false);
    expect(writeThemeChoice(() => ({ setItem: refusing }), "dark")).toBe(false);
  });
});

describe("following the operating system", () => {
  it("draws 'system' as the default light look or as the dark one, the others as themselves", () => {
    expect(resolveTheme("system", false)).toBe("pastel");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("rangxay", true)).toBe("rangxay");
    expect(resolveTheme("pastel", true)).toBe("pastel");
  });

  it("asks the system through matchMedia, and takes light where it cannot ask", () => {
    expect(systemPrefersDark(window)).toBe(false);
    schemeOf(true);
    expect(systemPrefersDark(window)).toBe(true);
    expect(systemPrefersDark({ matchMedia: refusing })).toBe(false);
  });

  it("hears the system turn dark and stops hearing once told to", () => {
    schemeOf(false);
    const heard: boolean[] = [];
    const stop = watchSystemScheme(window, () => heard.push(systemPrefersDark(window)));
    schemeTurns(true);
    schemeTurns(false);
    stop();
    schemeTurns(true);
    expect(heard).toEqual([true, false]);
  });

  it("puts the look and the choice on <html>", () => {
    applyThemeChoice(html, "system", true);
    expect(html.dataset).toMatchObject({ theme: "dark", themeChoice: "system" });
    applyThemeChoice(html, "rangxay", true);
    expect(html.dataset).toMatchObject({ theme: "rangxay", themeChoice: "rangxay" });
  });
});

describe("the head's script, before the first paint", () => {
  const boot = () => new Function(THEME_BOOT_SCRIPT)() as void;

  it("draws what the app itself would, for every kept value and either system scheme", () => {
    for (const dark of [false, true]) {
      schemeOf(dark);
      for (const kept of [...THEME_CHOICES, "unknown", null]) {
        if (kept === null) window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, kept);
        boot();
        const choice = readThemeChoice(() => window.localStorage);
        expect(html.dataset, `${kept} dark=${dark}`).toMatchObject({
          theme: resolveTheme(choice, dark),
          themeChoice: choice,
        });
      }
    }
  });

  it("still draws the default when storage and matchMedia both throw", () => {
    const storage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get: refusing });
    try {
      boot();
      expect(html.dataset).toMatchObject({ theme: "pastel", themeChoice: "pastel" });
    } finally {
      if (storage) Object.defineProperty(window, "localStorage", storage);
    }
  });
});

const APP = join(dirname(fileURLToPath(import.meta.url)), "../../app");
const themeColour = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;

/** A look's own value of a colour token in backoffice-tokens.css, as red, green and blue. */
function tokenOf(theme: string, token: string): number[] {
  const css = readFileSync(join(APP, "backoffice-tokens.css"), "utf8");
  for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!block[1]!.includes(`data-theme="${theme}"`)) continue;
    const hex = new RegExp(`${token}:\\s*#([0-9a-f]{6})`, "i").exec(block[2]!)?.[1];
    if (hex !== undefined) return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  }
  throw new Error(`${token} is not set in ${theme}`);
}

describe("the browser's theme-color", () => {
  it("is the colour the bar across the top is drawn in, in every look", () => {
    const shell = readFileSync(join(APP, "backoffice-shell.css"), "utf8");
    expect(shell).toMatch(/\.bo-topbar \{[^}]*background: color-mix\(in srgb, var\(--c-bg\) 82%, var\(--c-surface\)\);/);
    expect(Object.keys(THEME_BAR_COLOUR).sort()).toEqual(["dark", "pastel", "rangxay"]);
    for (const [theme, colour] of Object.entries(THEME_BAR_COLOUR)) {
      const bg = tokenOf(theme, "--c-bg");
      const surface = tokenOf(theme, "--c-surface");
      const mixed = bg.map((channel, at) => Math.round(channel * 0.82 + surface[at]! * 0.18));
      expect(colour, theme).toBe(`#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
    }
  });

  it("is set before the first paint to the bar of the look drawn", () => {
    for (const dark of [false, true]) {
      schemeOf(dark);
      for (const kept of [...THEME_CHOICES, "unknown", null]) {
        if (kept === null) window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, kept);
        new Function(THEME_BOOT_SCRIPT)();
        const theme = resolveTheme(readThemeChoice(() => window.localStorage), dark);
        expect(themeColour(), `${kept} dark=${dark}`).toBe(THEME_BAR_COLOUR[theme]);
        expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
      }
    }
  });

  it("follows every new choice, system following the operating system", () => {
    applyThemeChoice(html, "rangxay", false);
    expect(themeColour()).toBe(THEME_BAR_COLOUR.rangxay);
    applyThemeChoice(html, "dark", false);
    expect(themeColour()).toBe(THEME_BAR_COLOUR.dark);
    applyThemeChoice(html, "system", false);
    expect(themeColour()).toBe(THEME_BAR_COLOUR.pastel);
    applyThemeChoice(html, "system", true);
    expect(themeColour()).toBe(THEME_BAR_COLOUR.dark);
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  });
});
