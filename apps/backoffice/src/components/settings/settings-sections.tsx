"use client";

import { type LucideIcon, Plug, ToggleRight, Wallet } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { SettingsScope, SettingsView } from "../../lib/api/settings-api";
import type { PlaceNames } from "../../lib/settings/switch-refusal-message";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { type SectionPart, SectionNav } from "../ui/section-nav";
import { ChargeProfileSection } from "./charge-profile-section";
import { CLOSE_TOLERANCE_KEY, CloseToleranceSection } from "./close-tolerance-section";
import { EInvoiceProfileSection } from "./einvoice-profile-section";
import { FeatureSwitches } from "./feature-switches";
import { PaymentAccountSection } from "./payment-account-section";
import { useSettingWrite } from "./use-setting-write";
import { WalletAccountSection } from "./wallet-account-section";
import { WebhookSecretSection } from "./webhook-secret-section";

/** A heading over the cards of one kind of setting, laid two across on a wide screen. */
function SettingsGroup({ id, icon, title, children }: { id: string; icon: LucideIcon; title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="bo-settings-group" aria-labelledby={titleId} id={id}>
      <h2 id={titleId} className="bo-group-title">
        <Icon of={icon} size={20} />
        {title}
      </h2>
      <div className="bo-settings-grid">{children}</div>
    </section>
  );
}

/**
 * Every switch and setting of one scope, as the server last answered them. Each card
 * writes on its own and shows its own outcome; the page shows whatever view the server
 * answers a write with, so inheritance and sources are never worked out here.
 */
const G = vi.settings.groups;
const PARTS: readonly SectionPart[] = [
  { id: "settings-features", label: G.features, icon: ToggleRight },
  { id: "settings-money", label: G.money, icon: Wallet },
  { id: "settings-invoices", label: G.invoices, icon: Plug },
];

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
    <div className="bo-stack bo-settings">
      <SectionNav label={vi.settings.groupsLabel} parts={PARTS} />
      <SettingsGroup id={PARTS[0]!.id} icon={ToggleRight} title={G.features}>
        <FeatureSwitches entries={switches} scope={scope} names={names} onView={onView} />
      </SettingsGroup>
      <SettingsGroup id={PARTS[1]!.id} icon={Wallet} title={G.money}>
        {chargeEntry !== undefined && <ChargeProfileSection entry={chargeEntry} write={charge} />}
        {accountEntry !== undefined && <PaymentAccountSection entry={accountEntry} write={account} />}
        {toleranceEntry !== undefined && <CloseToleranceSection entry={toleranceEntry} write={tolerance} />}
      </SettingsGroup>
      <SettingsGroup id={PARTS[2]!.id} icon={Plug} title={G.invoices}>
        {einvoiceEntry !== undefined && <EInvoiceProfileSection entry={einvoiceEntry} write={einvoice} />}
        {scope.kind === "branch" ? (
          <WebhookSecretSection branchId={scope.id} />
        ) : (
          <p className="bo-muted bo-wrap">{vi.settings.secret.branchOnly}</p>
        )}
        {scope.kind === "branch" ? (
          <WalletAccountSection branchId={scope.id} />
        ) : (
          <p className="bo-muted bo-wrap">{vi.settings.wallets.branchOnly}</p>
        )}
      </SettingsGroup>
    </div>
  );
}
