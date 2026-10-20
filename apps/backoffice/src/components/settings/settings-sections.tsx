"use client";

import type { SettingsScope, SettingsView } from "../../lib/api/settings-api";
import type { PlaceNames } from "../../lib/settings/switch-refusal-message";
import { vi } from "../../messages/vi";
import { ChargeProfileSection } from "./charge-profile-section";
import { CLOSE_TOLERANCE_KEY, CloseToleranceSection } from "./close-tolerance-section";
import { EInvoiceProfileSection } from "./einvoice-profile-section";
import { FeatureSwitches } from "./feature-switches";
import { PaymentAccountSection } from "./payment-account-section";
import { useSettingWrite } from "./use-setting-write";
import { WebhookSecretSection } from "./webhook-secret-section";

/**
 * Every switch and setting of one scope, as the server last answered them. Each card
 * writes on its own and shows its own outcome; the page shows whatever view the server
 * answers a write with, so inheritance and sources are never worked out here.
 */
export function SettingsSections({
  scope,
  view,
  names,
  onView,
}: {
  scope: SettingsScope;
  view: SettingsView;
  names: PlaceNames;
  onView: (view: SettingsView) => void;
}) {
  const charge = useSettingWrite(scope, onView);
  const account = useSettingWrite(scope, onView);
  const einvoice = useSettingWrite(scope, onView);
  const tolerance = useSettingWrite(scope, onView);
  const entryOf = (key: string) => view.entries.find((entry) => entry.key === key);
  const switches = view.entries.filter((entry) => entry.kind === "flag" || typeof entry.value === "boolean");
  const chargeEntry = entryOf("charge_profile");
  const accountEntry = entryOf("payment_account");
  const einvoiceEntry = entryOf("einvoice_profile");
  const toleranceEntry = entryOf(CLOSE_TOLERANCE_KEY);
  return (
    <div className="bo-stack">
      <FeatureSwitches entries={switches} scope={scope} names={names} onView={onView} />
      {chargeEntry !== undefined && <ChargeProfileSection entry={chargeEntry} write={charge} />}
      {accountEntry !== undefined && <PaymentAccountSection entry={accountEntry} write={account} />}
      {einvoiceEntry !== undefined && <EInvoiceProfileSection entry={einvoiceEntry} write={einvoice} />}
      {toleranceEntry !== undefined && <CloseToleranceSection entry={toleranceEntry} write={tolerance} />}
      {scope.kind === "branch" ? (
        <WebhookSecretSection branchId={scope.id} />
      ) : (
        <p className="bo-muted bo-wrap">{vi.settings.secret.branchOnly}</p>
      )}
    </div>
  );
}
