import { createHttpSyncTransport, fetchHttpSend } from "@fnb/sync-client";
import { openBrowserLocalStore } from "@fnb/sync-client/browser";
import { createRoot } from "react-dom/client";
import { PosApp } from "./app/pos-app";
import type { PosDependencies } from "./app/pos-dependencies";
import { httpPosApi } from "./features/api/pos-api";
import { httpBootstrapSource } from "./features/bootstrap/bootstrap-source";
import { httpFloorSource } from "./features/floor/floor-occupancy";
import { printerForBuild } from "./features/printing/printer-port";
import { indexedDbDeviceCredentialStore } from "./shell-bridge/indexeddb-device-credential-store";
import "./styles/pos-base.css";
import "./styles/pos-screens.css";
import "./styles/pos-sale.css";
import "./styles/pos-order.css";
import "./styles/pos-picker.css";
import "./styles/pos-checkout.css";
import "./styles/pos-floor.css";
import "./styles/pos-operations.css";

/** The API under the POS's own origin (proxied by Vite), unless a build points elsewhere. */
const API_BASE: string = import.meta.env.VITE_FNB_API_BASE ?? "/api";

const store = openBrowserLocalStore();
// The app reports a failed open on screen; this only keeps it from counting as unhandled.
store.catch(() => {});

const deps: PosDependencies = {
  store,
  credentials: indexedDbDeviceCredentialStore(),
  api: httpPosApi(API_BASE),
  bootstrap: httpBootstrapSource(API_BASE),
  floor: httpFloorSource(API_BASE),
  transportFor: (credential, staffSessionToken) =>
    createHttpSyncTransport({
      send: fetchHttpSend(API_BASE),
      deviceToken: credential.deviceToken,
      staffSessionToken,
    }),
  syncIdleMs: 5_000,
  // The web build prints nothing; an end-to-end build may ask for a printer that always takes.
  printer: printerForBuild(import.meta.env.VITE_FNB_SIMULATED_PRINTER),
  reload: () => window.location.reload(),
};

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");
// No StrictMode: its mount-unmount-mount would start a second sync loop on the same store
// while the first one's pass is still in flight, two batches of one till at once.
createRoot(root).render(<PosApp deps={deps} />);
