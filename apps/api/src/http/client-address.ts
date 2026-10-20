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

/**
 * What a client address is counted under. One IPv6 subscriber is handed a whole /64 and
 * can pick a new address in it for every request, so IPv6 is counted by its /64 prefix;
 * an IPv4 address (also one written as ::ffff:a.b.c.d) is counted as it is.
 */
export function addressCountedAs(address: string): string {
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(plain) !== 6) return plain;
  const [head = "", tail] = plain.toLowerCase().split("%")[0]?.split("::") ?? [];
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  const groups = [...left, ...missing, ...right].map((group) => group.replace(/^0+(?=.)/, ""));
  return `${groups.slice(0, 4).join(":")}::/64`;
}

function isTrusted(trusted: TrustedProxies, address: string): boolean {
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  const family = isIP(plain);
  if (family === 0) return false;
  return trusted.check(plain, family === 4 ? "ipv4" : "ipv6");
}
