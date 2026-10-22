"use client";

import { useEffect } from "react";
import { subscribeTheme } from "../../lib/theme/theme-store";

/**
 * Keeps every page, the sign-in page too, in step with the look chosen in another tab and,
 * when the choice is "Theo máy", with the operating system turning dark or light.
 */
export function ThemeFollower() {
  useEffect(() => subscribeTheme(() => undefined), []);
  return null;
}
