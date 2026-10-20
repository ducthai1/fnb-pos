import {
  type DeviceCredential,
  type DeviceCredentialStore,
  isDeviceCredential,
} from "./device-credential-store";

const DATABASE = "fnb-pos-device";
const STORE = "credential";
const KEY = "current";

// WARNING: in the browser build the device token sits in IndexedDB, readable by any script
// that runs on this origin and by anyone with the machine's browser profile. The page has no
// better place. The Tauri and Capacitor shells must implement DeviceCredentialStore over the
// OS keychain instead and never fall back to this one.

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB did not open"));
  });
}

async function inStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      // Resolved on complete, not on the request's success: only then is a write durable.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB aborted"));
    });
  } finally {
    db.close();
  }
}

export function indexedDbDeviceCredentialStore(): DeviceCredentialStore {
  return {
    async load(): Promise<DeviceCredential | null> {
      const stored: unknown = await inStore("readonly", (store) => store.get(KEY));
      return isDeviceCredential(stored) ? stored : null;
    },
    async save(credential) {
      await inStore("readwrite", (store) => store.put({ ...credential }, KEY));
    },
    async clear() {
      await inStore("readwrite", (store) => store.delete(KEY));
    },
  };
}
