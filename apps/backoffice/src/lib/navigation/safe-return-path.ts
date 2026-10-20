const HOME = "/";

/*
 * Characters a URL parser skips, folds or reads as a separator: controls (tab, CR and LF
 * are removed before parsing, so "/\t/evil.example" becomes "//evil.example"), format
 * characters (zero-width, bidi marks, BOM), every Unicode space or separator, and the
 * backslash, which parsers read as "/" in http(s) URLs. None belongs in a page address of
 * this site, so a return path holding one is refused whole instead of cleaned.
 */
const UNSAFE_CHARACTER = /[\p{Cc}\p{Cf}\p{Z}\s\\]/u;

/** Decoding more layers than this is no address a page of this site ever puts in `next`. */
const MAX_DECODE_ROUNDS = 4;

/**
 * The text as given and every layer of percent-decoding under it, or null when a layer is
 * malformed or the layers never settle: "/%09/evil.example" must be judged as the
 * "/\t/evil.example" it means, not only as the harmless-looking text it arrives as.
 */
function decodedLayers(text: string): string[] | null {
  const layers = [text];
  for (let round = 0; round < MAX_DECODE_ROUNDS; round++) {
    const current = layers[layers.length - 1]!;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) return layers;
    layers.push(decoded);
  }
  return null;
}

/** A path of this site: exactly one leading "/", and nothing a parser would bend. */
const isPlainSitePath = (text: string): boolean =>
  text.startsWith("/") && !text.startsWith("//") && !UNSAFE_CHARACTER.test(text);

/** The text, and every decoded layer of it, is a plain path of this site. */
const isPlainAtEveryLayer = (text: string): boolean =>
  decodedLayers(text)?.every(isPlainSitePath) ?? false;

/**
 * Where to go after signing in: the page the person was sent away from, but only a page of
 * this site. Anything else (another site, a scheme, an address a parser would read as one)
 * falls back to the home page. The path is checked as given and decoded, resolved against
 * the site's own origin and kept only when it resolves there. What is returned is the
 * parsed path, so the navigation goes exactly where the check looked, and it is checked
 * again: removing dot segments turns "/.//evil.example" into "//evil.example".
 */
export function safeReturnPath(next: string | null, origin: string): string {
  if (next === null || !isPlainAtEveryLayer(next)) return HOME;
  let site: URL;
  let target: URL;
  try {
    site = new URL(origin);
    target = new URL(next, site);
  } catch {
    return HOME;
  }
  if (target.origin !== site.origin) return HOME;
  if (target.pathname === "/login" || target.pathname.startsWith("/login/")) return HOME;
  const path = `${target.pathname}${target.search}${target.hash}`;
  return isPlainAtEveryLayer(path) ? path : HOME;
}
