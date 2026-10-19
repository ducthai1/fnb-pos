// Plain major.minor.patch only: no "v" prefix, pre-release or build tag, no leading zeros.
// A till reporting anything else is misconfigured, and accepting it would let commands computed
// by an unknown rule set through, so a malformed version is never supported.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Whether commands computed by `clientVersion` of the domain rules may be accepted, given the
 * oldest version the server still accepts. Parts compare as numbers ("0.10.0" is newer than
 * "0.9.0"); BigInt keeps a long part exact instead of rounding it to a float.
 */
export function isSupportedDomainVersion(clientVersion: string, minimumSupported: string): boolean {
  const client = parse(clientVersion);
  const minimum = parse(minimumSupported);
  if (client === null || minimum === null) return false;
  for (let i = 0; i < client.length; i++) {
    const [c, m] = [client[i] ?? 0n, minimum[i] ?? 0n];
    if (c !== m) return c > m;
  }
  return true;
}

function parse(version: string): bigint[] | null {
  const match = SEMVER.exec(version);
  return match ? match.slice(1).map((part) => BigInt(part)) : null;
}
