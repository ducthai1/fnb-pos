/** The query parameter of a pairing link, e.g. `http://127.0.0.1:5173/?pair=ABCD-EFGH`. */
export const PAIRING_LINK_PARAM = "pair";

/**
 * Reads the pairing code a link carries and takes it out of the address bar at once, so a
 * reload, a bookmark or a shared screenshot never carries it again. The code is only held in
 * memory for the pairing screen; it stays single-use and expiring on the server.
 */
export function takePairingCodeFromAddress(
  location: Pick<Location, "href">,
  history: Pick<History, "replaceState" | "state">,
): string | null {
  const url = new URL(location.href);
  const code = url.searchParams.get(PAIRING_LINK_PARAM);
  if (code === null) return null;
  url.searchParams.delete(PAIRING_LINK_PARAM);
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  const trimmed = code.trim();
  return trimmed === "" ? null : trimmed;
}
