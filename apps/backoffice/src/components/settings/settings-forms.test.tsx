import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { refused } from "../../test-support/fake-backoffice-api";
import { BRANCH_SCOPE, fakeSettings } from "../../test-support/fake-settings";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { SettingsScreen } from "./settings-screen";

const T = vi.settings;

const card = (key: string) => document.querySelector<HTMLElement>(`section[data-setting-key="${key}"]`)!;
const type = (scope: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const save = (scope: HTMLElement) => fireEvent.click(within(scope).getByRole("button", { name: vi.common.save }));

async function openSettings(settings = fakeSettings(), more = {}) {
  await renderSignedIn(<SettingsScreen />, { ...settings.api, ...more });
  await screen.findByRole("heading", { name: T.account.title });
  return settings;
}

describe("the receiving account", () => {
  it("saves the bank chosen from the list, the number without its spaces, and the holder", async () => {
    const settings = await openSettings();
    const account = card("payment_account");
    fireEvent.change(within(account).getByLabelText(T.account.bank), { target: { value: "970436" } });
    type(account, T.account.accountNumber, "0071 0012 3456 7");
    type(account, T.account.accountName, "NGUYEN VAN AN");
    save(account);
    await within(card("payment_account")).findByText(vi.common.saved);
    expect(settings.putSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "payment_account", {
      bankBin: "970436",
      accountNumber: "0071001234567",
      accountName: "NGUYEN VAN AN",
    });
  });

  it("takes a bank missing from the list by its BIN", async () => {
    const settings = await openSettings();
    const account = card("payment_account");
    fireEvent.change(within(account).getByLabelText(T.account.bank), { target: { value: "other" } });
    type(account, T.account.bin, "970999");
    type(account, T.account.accountNumber, "123");
    type(account, T.account.accountName, "Quán Sáng");
    save(account);
    await waitFor(() => expect(settings.putSetting).toHaveBeenCalled());
    expect(settings.putSetting.mock.calls[0]![2]).toMatchObject({ bankBin: "970999" });
  });

  it("sends nothing while a field is wrong, and says which", async () => {
    const settings = await openSettings();
    const account = card("payment_account");
    type(account, T.account.accountNumber, "12-34");
    save(account);
    expect(await within(account).findByText(T.account.binInvalid)).toBeTruthy();
    expect(within(account).getByText(T.account.accountNumberInvalid)).toBeTruthy();
    expect(within(account).getByText(T.account.accountNameInvalid)).toBeTruthy();
    expect(settings.putSetting).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the account card only", async () => {
    await openSettings(fakeSettings(), { putSetting: async () => refused(400, "API_INVALID_REQUEST") });
    const account = card("payment_account");
    fireEvent.change(within(account).getByLabelText(T.account.bank), { target: { value: "970418" } });
    type(account, T.account.accountNumber, "123456");
    type(account, T.account.accountName, "An");
    save(account);
    const alert = await within(account).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_INVALID_REQUEST);
    expect(within(card("charge_profile")).queryByRole("alert")).toBeNull();
  });
});

describe("how the branch prices an order", () => {
  it("saves a service charge on the channels, base and VAT rate chosen, as basis points", async () => {
    const settings = await openSettings();
    const charge = card("charge_profile");
    fireEvent.click(within(charge).getByLabelText(T.charge.serviceChargeOn));
    type(charge, T.charge.rate, "5");
    type(charge, T.charge.taxRate, "8");
    fireEvent.click(within(charge).getByLabelText(T.charge.channels.dine_in!));
    fireEvent.click(within(charge).getByLabelText(T.charge.afterDiscount));
    save(charge);
    await within(card("charge_profile")).findByText(vi.common.saved);
    expect(settings.putSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "charge_profile", {
      pricesIncludeTax: true,
      serviceCharge: { rate: 500, appliesTo: ["dine_in"], base: "after_discount", taxRate: 800 },
    });
  });

  it("refuses a service charge on no channel, or of 0% or past 100%", async () => {
    const settings = await openSettings();
    const charge = card("charge_profile");
    fireEvent.click(within(charge).getByLabelText(T.charge.serviceChargeOn));
    type(charge, T.charge.rate, "0");
    type(charge, T.charge.taxRate, "101");
    save(charge);
    expect(await within(charge).findByText(T.charge.appliesToMissing)).toBeTruthy();
    expect(within(charge).getByText(T.charge.rateInvalid)).toBeTruthy();
    expect(within(charge).getByText(T.charge.taxRateInvalid)).toBeTruthy();
    expect(settings.putSetting).not.toHaveBeenCalled();
  });
});

describe("the invoicing profile", () => {
  const fill = (profile: HTMLElement, symbol: string) => {
    type(profile, T.einvoice.sellerTaxCode, "0312345678");
    type(profile, T.einvoice.sellerName, "Công ty Trà Sáng");
    type(profile, T.einvoice.sellerAddress, "1 Lê Lợi, Q1");
    type(profile, T.einvoice.templateSymbol, symbol);
    type(profile, T.einvoice.provider, "vnpt");
  };

  it("refuses a template symbol the regime does not allow, under that field", async () => {
    const settings = await openSettings();
    const profile = card("einvoice_profile");
    fill(profile, "1K26TAB");
    save(profile);
    expect(await within(profile).findByText(T.einvoice.templateSymbolInvalid)).toBeTruthy();
    expect(settings.putSetting).not.toHaveBeenCalled();
  });

  it("saves a valid profile, its template symbol in capitals", async () => {
    const settings = await openSettings();
    const profile = card("einvoice_profile");
    fireEvent.click(within(profile).getByLabelText(T.einvoice.enabled));
    fill(profile, "1c26mab");
    save(profile);
    await within(card("einvoice_profile")).findByText(vi.common.saved);
    expect(settings.putSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "einvoice_profile", {
      enabled: true,
      sellerTaxCode: "0312345678",
      sellerName: "Công ty Trà Sáng",
      sellerAddress: "1 Lê Lợi, Q1",
      templateSymbol: "1C26MAB",
      provider: "vnpt",
      regimeVersion: "nd254-tt91",
      refundInvoicing: "none",
    });
  });

  it("shows a provider the server does not know in this card", async () => {
    await openSettings(fakeSettings(), { putSetting: async () => refused(400, "API_EINVOICE_UNKNOWN_PROVIDER") });
    const profile = card("einvoice_profile");
    fill(profile, "1c26mab");
    save(profile);
    const alert = await within(profile).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_EINVOICE_UNKNOWN_PROVIDER);
  });
});

describe("the drawer tolerance", () => {
  it("saves the amount as an exact decimal string of đồng", async () => {
    const settings = await openSettings();
    const tolerance = card("shift_close_difference_tolerance");
    type(tolerance, T.tolerance.label, "50.000");
    save(tolerance);
    await waitFor(() =>
      expect(settings.putSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "shift_close_difference_tolerance", "50000"),
    );
  });
});

describe("the gateway's webhook secret", () => {
  const SECRET = "sk_live_0123456789abcdef";

  it("sends the secret once, empties the field and never shows it again", async () => {
    const settings = await openSettings();
    const field = screen.getByLabelText(T.secret.secret) as HTMLInputElement;
    expect(field.type).toBe("password");
    fireEvent.change(field, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole("button", { name: T.secret.save }));
    await screen.findByText(T.secret.saved("SePay"));
    expect(settings.putWebhookSecret).toHaveBeenCalledWith(BRANCH_SCOPE.id, "sepay", SECRET);
    expect(field.value).toBe("");
    expect(document.body.innerHTML.includes(SECRET)).toBe(false);
  });

  it("refuses a secret too short to be safe without sending it", async () => {
    const settings = await openSettings();
    fireEvent.change(screen.getByLabelText(T.secret.secret), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: T.secret.save }));
    expect(await screen.findByText(T.secret.secretInvalid)).toBeTruthy();
    expect(settings.putWebhookSecret).not.toHaveBeenCalled();
  });
});

describe("the settings page, in groups", () => {
  it("puts the switches, the money settings and the invoice settings under their own headings", async () => {
    await openSettings();
    const group = (title: string) => screen.getByRole("heading", { name: title, level: 2 }).closest("section")!;
    expect(within(group(T.groups.features)).getByRole("heading", { name: T.switchesTitle })).toBeTruthy();
    expect(within(group(T.groups.money)).getByRole("heading", { name: T.account.title })).toBeTruthy();
    expect(within(group(T.groups.money)).queryByRole("heading", { name: T.switchesTitle })).toBeNull();
    expect(group(T.groups.invoices).querySelector('[data-setting-key="payment_account"]')).toBeNull();
  });
});
