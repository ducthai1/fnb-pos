// Opens the till's database exactly as the POS does and records one sale command, so two
// tabs of this page show whether the second one is turned away and what it is told.
import { isBrowserStoreError } from "../../../src/browser/browser-store-errors";
import { openBrowserLocalStore } from "../../../src/browser/open-browser-local-store";
import { orderCommand } from "../../../src/local-store/local-store-fixtures";
import type { SingleTabOutcome } from "../browser-page-results";

const DEVICE_ID = "0199f000-0000-7000-8000-00000000aaaa";

async function openAndRecord(): Promise<SingleTabOutcome> {
  try {
    const store = await openBrowserLocalStore({ file: "/single-tab.db" });
    await store.bindDevice(DEVICE_ID);
    // Ids unique across page loads: the fixture's counter starts again with every page.
    await store.enqueue(orderCommand(crypto.randomUUID(), { commandId: crypto.randomUUID() }));
    return { opened: true, pending: await store.pendingCount() };
  } catch (error) {
    return {
      opened: false,
      code: isBrowserStoreError(error) ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

void openAndRecord().then((outcome) => {
  (window as unknown as { __singleTab: SingleTabOutcome }).__singleTab = outcome;
});
