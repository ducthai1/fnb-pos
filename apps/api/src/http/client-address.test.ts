import { describe, expect, it } from "vitest";
import {
  addressCountedAs,
  clientAddress,
  isAddressOrRange,
  trustedProxies,
} from "./client-address";

const LOOPBACK = trustedProxies(["127.0.0.1", "::1"]);

describe("client address", () => {
  it("is the peer when no proxy is trusted, whatever the header claims", () => {
    expect(clientAddress("203.0.113.9", "198.51.100.1", null)).toBe("203.0.113.9");
  });

  it("is the peer when the peer is not a trusted proxy", () => {
    expect(clientAddress("203.0.113.9", "198.51.100.1", LOOPBACK)).toBe("203.0.113.9");
  });

  it("is the address a trusted proxy saw", () => {
    expect(clientAddress("127.0.0.1", "198.51.100.1", LOOPBACK)).toBe("198.51.100.1");
    expect(clientAddress("::ffff:127.0.0.1", "198.51.100.1", LOOPBACK)).toBe("198.51.100.1");
  });

  it("ignores what the client wrote before the proxy appended the real peer", () => {
    expect(clientAddress("127.0.0.1", "10.9.9.9, 198.51.100.1", LOOPBACK)).toBe("198.51.100.1");
  });

  it("skips every trusted hop, ranges included", () => {
    const proxies = trustedProxies(["127.0.0.1", "10.0.0.0/8"]);
    expect(clientAddress("127.0.0.1", "198.51.100.1, 10.1.2.3", proxies)).toBe("198.51.100.1");
  });

  it("falls back to the peer on a header that is not an address", () => {
    expect(clientAddress("127.0.0.1", "unknown", LOOPBACK)).toBe("127.0.0.1");
    expect(clientAddress("127.0.0.1", undefined, LOOPBACK)).toBe("127.0.0.1");
  });

  it("accepts addresses and ranges, and nothing else, as proxies", () => {
    expect(["127.0.0.1", "::1", "10.0.0.0/8", "fd00::/8"].map(isAddressOrRange)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ["localhost", "10.0.0.0/33", "10.0.0.0/x", "1.2.3.4/8/1", ""].map(isAddressOrRange),
    ).toEqual([false, false, false, false, false]);
  });
});

describe("what an address is counted under", () => {
  it("is the IPv4 address itself, however it is written", () => {
    expect(addressCountedAs("203.0.113.9")).toBe("203.0.113.9");
    expect(addressCountedAs("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("is the /64 of an IPv6 address, so hopping inside it does not reset the count", () => {
    const counted = [
      "2001:db8:aa:bb::1",
      "2001:db8:aa:bb:ffff:1:2:3",
      "2001:0db8:00aa:00bb:0:0:0:9",
      "2001:DB8:AA:BB::",
    ].map(addressCountedAs);
    expect(new Set(counted)).toEqual(new Set(["2001:db8:aa:bb::/64"]));
  });

  it("keeps different /64 networks apart", () => {
    expect(addressCountedAs("2001:db8:aa:bc::1")).toBe("2001:db8:aa:bc::/64");
    expect(addressCountedAs("::1")).toBe("0:0:0:0::/64");
    expect(addressCountedAs("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
});
