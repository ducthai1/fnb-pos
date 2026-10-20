import type { BackofficeCall } from "./backoffice-caller";

/**
 * What the sample branch runs with: table service on, prices that include VAT, a made-up
 * bank account for the QR, and invoices through the fake provider (they exist nowhere).
 */
export const SAMPLE_BRANCH_SETTINGS: Readonly<Record<string, unknown>> = {
  tables: true,
  charge_profile: { pricesIncludeTax: true, serviceCharge: null },
  payment_account: { bankBin: "970436", accountNumber: "1234567890", accountName: "CA PHE MAU" },
  einvoice_profile: {
    enabled: true,
    sellerTaxCode: "0109999999",
    sellerName: "Công ty TNHH Cà phê Mẫu",
    sellerAddress: "1 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM",
    templateSymbol: "1C26MAA",
    provider: "fake",
    regimeVersion: "nd254-tt91",
    refundInvoicing: "none",
  },
};

interface SettingsView {
  entries: { key: string; value: unknown; setHere: boolean }[];
}

/**
 * Each setting through the settings routes (flag rules and value checks included), written
 * only when the branch does not hold that value already, so a rerun adds no change for the
 * tills to pull. Then the SePay webhook key, stored sealed under the server's key.
 */
export async function seedBranchSettings(
  call: BackofficeCall,
  branchId: string,
  sepaySecret: string,
): Promise<void> {
  const view = await call<SettingsView>("GET", `/settings?scope=branch&scopeId=${branchId}`);
  for (const [key, value] of Object.entries(SAMPLE_BRANCH_SETTINGS)) {
    const entry = view.entries.find((candidate) => candidate.key === key);
    if (entry?.setHere === true && canonical(entry.value) === canonical(value)) continue;
    await call("PUT", `/settings/branch/${branchId}/${key}`, { value });
  }
  await call("PUT", `/payments/webhook-secrets/${branchId}/sepay`, { secret: sepaySecret }, 204);
}

/** JSON with keys sorted, so two equal values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}
