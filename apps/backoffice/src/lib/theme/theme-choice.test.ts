import { afterEach, describe, expect, it } from "vitest";
import { forgetScheme, schemeOf, schemeTurns } from "../../test-support/color-scheme";
import {
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
