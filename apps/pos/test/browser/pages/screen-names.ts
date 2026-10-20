/** The screens the layout test opens, each at phone and tablet width. */
export const SCREEN_NAMES = [
  "blocked",
  "pairing",
  "bootstrap-failed",
  "staff-picker",
  "pin-entry",
  "sales-home",
  "needs-attention",
] as const;

export type ScreenName = (typeof SCREEN_NAMES)[number];
