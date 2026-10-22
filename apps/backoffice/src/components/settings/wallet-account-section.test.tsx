import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { BRANCH_SCOPE, fakeSettings } from "../../test-support/fake-settings";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { SettingsScreen } from "./settings-screen";

const T = vi.settings.wallets;
const KEY1 = "made-up-key1-for-tests";
const KEY2 = "made-up-key2-for-tests";

async function openWallets() {
  const settings = fakeSettings();
  await renderSignedIn(<SettingsScreen />, settings.api);
  await screen.findByRole("heading", { name: T.title });
  const form = await waitForForm();
  return { settings, form };
}

async function waitForForm() {
  await screen.findByLabelText(T.turnOn("ZaloPay"));
  return document.querySelector<HTMLElement>('form[data-wallet="zalopay"]')!;
}

const type = (form: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });

describe("the e-wallets of a branch", () => {
  it("turns ZaloPay on with its keys, then shows only that the keys are saved", async () => {
    const { settings, form } = await openWallets();
    expect(within(form).getByText(T.keysMissing)).toBeTruthy();
    fireEvent.click(within(form).getByLabelText(T.turnOn("ZaloPay")));
    type(form, T.appId, "2553");
    type(form, T.key1, KEY1);
    type(form, T.key2, KEY2);
    expect((within(form).getByLabelText(T.key1) as HTMLInputElement).type).toBe("password");
    fireEvent.click(within(form).getByRole("button", { name: T.save }));
    await screen.findByText(T.saved("ZaloPay"));
    expect(settings.putWallet).toHaveBeenCalledWith(BRANCH_SCOPE.id, "zalopay", {
      enabled: true,
      credentials: { appId: "2553", key1: KEY1, key2: KEY2 },
    });
    expect(await screen.findByText(T.keysSaved)).toBeTruthy();
    expect(document.body.innerHTML.includes(KEY1)).toBe(false);
    expect(document.body.innerHTML.includes(KEY2)).toBe(false);
  });

  it("will not turn a wallet on without keys, and sends nothing", async () => {
    const { settings, form } = await openWallets();
    fireEvent.click(within(form).getByLabelText(T.turnOn("ZaloPay")));
    fireEvent.click(within(form).getByRole("button", { name: T.save }));
    expect(await screen.findByText(T.keysNeeded)).toBeTruthy();
    expect(settings.putWallet).not.toHaveBeenCalled();
  });
});
