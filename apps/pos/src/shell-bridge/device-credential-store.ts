/** What pairing gives a till: who it is, its branch, and the secret it authenticates with. */
export interface DeviceCredential {
  readonly deviceId: string;
  readonly branchId: string;
  readonly deviceToken: string;
}

/**
 * Where the till keeps its credential between launches. The native shells implement this
 * over the OS keychain (Windows Credential Manager, Android Keystore, iOS Keychain); the
 * browser build has only page storage (see indexeddb-device-credential-store.ts).
 */
export interface DeviceCredentialStore {
  load(): Promise<DeviceCredential | null>;
  save(credential: DeviceCredential): Promise<void>;
  clear(): Promise<void>;
}

export function isDeviceCredential(value: unknown): value is DeviceCredential {
  const record = value as Partial<Record<keyof DeviceCredential, unknown>> | null;
  return (
    typeof record?.deviceId === "string" &&
    typeof record.branchId === "string" &&
    typeof record.deviceToken === "string"
  );
}
