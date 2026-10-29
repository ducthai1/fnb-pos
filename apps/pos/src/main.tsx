import { createHttpSyncTransport, fetchHttpSend } from "@fnb/sync-client";
import { openBrowserLocalStore } from "@fnb/sync-client/browser";
import { createRoot } from "react-dom/client";
import { PosApp } from "./app/pos-app";
import { PosErrorBoundary } from "./app/pos-error-boundary";
import type { PosDependencies } from "./app/pos-dependencies";
import { ClientErrorQueue, webReportStorage } from "./features/client-errors/client-error-queue";
import {
  createClientErrorReporter,
  installGlobalErrorCapture,
} from "./features/client-errors/client-error-reporter";
import { httpSendReports } from "./features/client-errors/client-error-sender";
import { httpPosApi } from "./features/api/pos-api";
import { httpBootstrapSource } from "./features/bootstrap/bootstrap-source";
import { API_BASE } from "./features/menu/api-base";
import { httpFloorSource } from "./features/floor/floor-occupancy";
import { printerForBuild } from "./features/printing/printer-port";
import { theTillTheme } from "./features/theme/till-theme";
import { takePairingCodeFromAddress } from "./screens/pair-device/pairing-link";
import { indexedDbDeviceCredentialStore } from "./shell-bridge/indexeddb-device-credential-store";
import "./styles/pos-styles";

// index.html already set the kept theme; from here the till also follows the device while
// set to "Theo máy", on every screen, signed in or not.
theTillTheme();

// Faults are queued on the device and sent once the till is paired and online; the handlers
// go in first so a fault while the rest of this file runs is still seen.
const clientErrors = createClientErrorReporter({
  queue: new ClientErrorQueue(webReportStorage(window.localStorage), () => Date.now()),
  send: httpSendReports(API_BASE),
  appVersion: import.meta.env.VITE_FNB_RELEASE_ID ?? "dev",
  now: () => Date.now(),
  route: () => window.location.pathname,
});
installGlobalErrorCapture(window, clientErrors);

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
  clientErrors,
  // Taken before the first render, whatever screen comes up: a till already paired ignores it.
  linkedPairingCode: takePairingCodeFromAddress(window.location, window.history),
};

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");
// No StrictMode: its mount-unmount-mount would start a second sync loop on the same store
// while the first one's pass is still in flight, two batches of one till at once.
createRoot(root).render(
  <PosErrorBoundary reporter={clientErrors} onReload={deps.reload}>
    <PosApp deps={deps} />
  </PosErrorBoundary>,
);
