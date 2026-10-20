import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { fakeSettings } from "../../test-support/fake-settings";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { SettingsScreen } from "./settings-screen";

const T = vi.settings;

async function openSettings(settings = fakeSettings()) {
  await renderSignedIn(<SettingsScreen />, settings.api);
  await screen.findByRole("heading", { name: T.account.title });
  return settings;
}

describe("the settings page, in groups", () => {
  it("puts the switches, the money settings and the invoice settings under their own headings", async () => {
    await openSettings();
    const group = (title: string) => screen.getByRole("heading", { name: title, level: 2 }).closest("section")!;
    expect(within(group(T.groups.features)).getByRole("heading", { name: T.switchesTitle })).toBeTruthy();
    expect(within(group(T.groups.money)).getByRole("heading", { name: T.account.title })).toBeTruthy();
    expect(within(group(T.groups.money)).queryByRole("heading", { name: T.switchesTitle })).toBeNull();
    expect(group(T.groups.invoices).querySelector('[data-setting-key="payment_account"]')).toBeNull();
  });

  it("goes to a group from the segments over the page", async () => {
    await openSettings();
    const parts = screen.getByRole("group", { name: T.groupsLabel });
    const money = within(parts).getByRole("button", { name: T.groups.money });
    const target = screen.getByRole("heading", { name: T.groups.money, level: 2 }).closest("section")!;
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    fireEvent.click(money);
    expect(scrolled).toBe(true);
    expect(money.getAttribute("aria-pressed")).toBe("true");
  });
});
