import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DARK_SCHEME_QUERY,
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  type ThemeHost,
  readThemeChoice,
  resolveTheme,
  startTillTheme,
  writeThemeChoice,
} from "./till-theme";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const refusing = (): Storage => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

/** A device whose light or dark setting the test flips, as the OS would. */
function fakeDevice(dark: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    get matches() {
      return dark;
    },
    media: DARK_SCHEME_QUERY,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  const asked: string[] = [];
  return {
    matchMedia: (query: string) => {
      asked.push(query);
      return list;
    },
    asked,
    listeners,
    turn(toDark: boolean) {
      dark = toDark;
      for (const listener of listeners) listener();
    },
  };
}

function host(storage: () => Storage, device?: ReturnType<typeof fakeDevice>): ThemeHost {
  return { root: document.createElement("html"), storage, matchMedia: device?.matchMedia };
}

describe("the theme kept on a till", () => {
  it("reads back what was chosen", () => {
    const storage = memoryStorage();
    for (const choice of THEME_CHOICES) {
      expect(writeThemeChoice(() => storage, choice)).toBe(true);
      expect(storage.getItem(THEME_STORAGE_KEY)).toBe(choice);
      expect(readThemeChoice(() => storage)).toBe(choice);
    }
  });

  it("is the soft blue when nothing is kept, something unknown is, or storage is refused", () => {
    expect(readThemeChoice(() => memoryStorage())).toBe("pastel");
    expect(readThemeChoice(() => memoryStorage({ [THEME_STORAGE_KEY]: "neon" }))).toBe("pastel");
    expect(readThemeChoice(() => memoryStorage({ [THEME_STORAGE_KEY]: "" }))).toBe("pastel");
    expect(readThemeChoice(refusing)).toBe("pastel");
    const throwingRead = memoryStorage();
    throwingRead.getItem = () => {
      throw new Error("storage broken");
    };
    expect(readThemeChoice(() => throwingRead)).toBe("pastel");
  });

  it("says so when the browser will not keep the choice, without throwing", () => {
    const full = memoryStorage();
    full.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    expect(writeThemeChoice(() => full, "dark")).toBe(false);
    expect(writeThemeChoice(refusing, "dark")).toBe(false);
  });
});

describe("applying the theme", () => {
  it("sets the kept theme on the page before anything is chosen, the default when none", () => {
    const fresh = host(() => memoryStorage());
    startTillTheme(fresh);
    expect(fresh.root.dataset.theme).toBe("pastel");
    const warm = host(() => memoryStorage({ [THEME_STORAGE_KEY]: "rangxay" }));
    startTillTheme(warm);
    expect(warm.root.dataset.theme).toBe("rangxay");
  });

  it("applies a choice at once, keeps it and tells who listens", () => {
    const storage = memoryStorage();
    const page = host(() => storage);
    const theme = startTillTheme(page);
    let told = 0;
    theme.subscribe(() => void (told += 1));
    theme.choose("dark");
    expect(page.root.dataset.theme).toBe("dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(theme.choice()).toBe("dark");
    expect(told).toBe(1);
  });

  it("still applies a choice the browser refuses to keep", () => {
    const page = host(refusing);
    const theme = startTillTheme(page);
    theme.choose("rangxay");
    expect(page.root.dataset.theme).toBe("rangxay");
  });

  it("follows the device while set to follow it: light is the soft blue, dark is dark", () => {
    const device = fakeDevice(true);
    const page = host(() => memoryStorage({ [THEME_STORAGE_KEY]: "system" }), device);
    const theme = startTillTheme(page);
    expect(device.asked).toEqual([DARK_SCHEME_QUERY]);
    expect(page.root.dataset.theme).toBe("dark");
    device.turn(false);
    expect(page.root.dataset.theme).toBe("pastel");
    device.turn(true);
    expect(page.root.dataset.theme).toBe("dark");
    theme.stop();
    expect(device.listeners.size).toBe(0);
  });

  it("ignores the device once a theme of its own is chosen", () => {
    const device = fakeDevice(false);
    const page = host(() => memoryStorage({ [THEME_STORAGE_KEY]: "system" }), device);
    const theme = startTillTheme(page);
    theme.choose("rangxay");
    device.turn(true);
    expect(page.root.dataset.theme).toBe("rangxay");
    theme.choose("system");
    expect(page.root.dataset.theme).toBe("dark");
  });

  it("counts a browser without a colour setting as light", () => {
    const page = host(() => memoryStorage({ [THEME_STORAGE_KEY]: "system" }));
    startTillTheme(page);
    expect(page.root.dataset.theme).toBe("pastel");
  });
});

/** Runs index.html's own pre-paint script against a stored value and a device setting. */
function runBootScript(kept: string | null | "refused", deviceIsDark: boolean): string | null {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  expect(scripts).toHaveLength(1);
  const root = document.createElement("html");
  const fakeWindow = {
    get localStorage() {
      if (kept === "refused") throw new DOMException("insecure", "SecurityError");
      return memoryStorage(kept === null ? {} : { [THEME_STORAGE_KEY]: kept });
    },
    matchMedia: (query: string) => ({ matches: query === DARK_SCHEME_QUERY && deviceIsDark }),
  };
  new Function("window", "document", scripts[0]!)(fakeWindow, { documentElement: root });
  return root.getAttribute("data-theme");
}

describe("the theme set before the first paint", () => {
  it("is the same theme the app applies, for every kept value and device setting", () => {
    for (const kept of [...THEME_CHOICES, null, "neon"]) {
      for (const dark of [false, true]) {
        const choice = readThemeChoice(() =>
          memoryStorage(kept === null ? {} : { [THEME_STORAGE_KEY]: kept }),
        );
        expect(runBootScript(kept, dark), `${String(kept)} on a ${dark ? "dark" : "light"} device`).toBe(
          resolveTheme(choice, dark),
        );
      }
    }
  });

  it("is the soft blue when storage is refused, even on a dark device", () => {
    expect(runBootScript("refused", true)).toBe("pastel");
  });
});
