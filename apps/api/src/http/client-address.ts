import { BlockList, isIP } from "node:net";

/** The proxies whose X-Forwarded-For is believed: exact addresses or CIDR ranges. */
export type TrustedProxies = BlockList;

/** Whether `text` is an IPv4/IPv6 address or a CIDR range such as 10.0.0.0/8. */
export function isAddressOrRange(text: string): boolean {
  const [address = "", prefix, extra] = text.split("/");
  const family = isIP(address);
  if (family === 0 || extra !== undefined) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d+$/.test(prefix) && bits <= (family === 4 ? 32 : 128);
}

/** The proxies list, for entries already checked with isAddressOrRange. */
export function trustedProxies(entries: readonly string[]): TrustedProxies {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = "", prefix] = entry.split("/");
    const type = isIP(address) === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return list;
}

/**
 * The address a request came from. A peer that is not a trusted proxy is the client
 * itself, whatever X-Forwarded-For claims (anyone can send that header). Behind trusted
 * proxies the client is the last address in the header that is not one of them: each
 * proxy appends the peer it saw, so earlier entries are the client's own word.
 */
export function clientAddress(
  peer: string,
  forwardedFor: string | string[] | undefined,
  trusted: TrustedProxies | null,
): string {
  if (trusted === null || !isTrusted(trusted, peer)) return peer;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? "");
  const hops = header
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "");
  for (let index = hops.length - 1; index >= 0; index--) {
    const hop = hops[index] ?? "";
    if (isIP(hop) === 0) return peer;
    if (!isTrusted(trusted, hop)) return hop;
  }
  return peer;
}

function isTrusted(trusted: TrustedProxies, address: string): boolean {
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  const family = isIP(plain);
  if (family === 0) return false;
  return trusted.check(plain, family === 4 ? "ipv4" : "ipv6");
}
