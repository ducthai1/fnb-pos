import { type ReactElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/pos-styles";
import { ENTRY_SCREENS } from "./pretty-entry-screens";
import { OPERATIONS_SCREENS } from "./pretty-operations-screens";
import { SELLING_SCREENS } from "./pretty-selling-screens";
import { TABLE_SCREENS } from "./pretty-table-screens";

// Every movement lands at once: a measurement or a picture never catches one half done.
document.documentElement.dataset.motion = "off";

// The till's screens with the sample café's data, chosen by ?screen=, for the handbook.

const SCREENS: Readonly<Record<string, () => ReactElement>> = {
  ...ENTRY_SCREENS,
  ...SELLING_SCREENS,
  ...TABLE_SCREENS,
  ...OPERATIONS_SCREENS,
};

/** Marks the page once React has rendered the screen, so the capture never runs early. */
function Ready({ name, children }: { name: string; children: ReactElement }) {
  useEffect(() => {
    document.body.dataset.screenReady = name;
  }, [name]);
  return children;
}

const name = new URLSearchParams(location.search).get("screen") ?? "";
const screen = SCREENS[name];
const root = document.getElementById("root");
if (screen === undefined || root === null) throw new Error(`no screen named "${name}"`);
createRoot(root).render(<Ready name={name}>{screen()}</Ready>);
