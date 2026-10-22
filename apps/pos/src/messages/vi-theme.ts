import type { ThemeChoice } from "../features/theme/till-theme";

/** The till's look, chosen from the bar: a choice of this till, not a setting of the shop. */
export const VI_THEME = {
  open: "Giao diện",
  menuLabel: "Chọn giao diện",
  names: {
    pastel: "Xanh pastel",
    rangxay: "Rang xay",
    dark: "Tối",
    system: "Theo máy",
  } satisfies Record<ThemeChoice, string>,
  hints: {
    pastel: "Sáng, xanh dịu · mặc định",
    rangxay: "Sáng, nâu ấm",
    dark: "Nền tối, đỡ chói",
    system: "Sáng hay tối theo cài đặt của máy",
  } satisfies Record<ThemeChoice, string>,
} as const;
