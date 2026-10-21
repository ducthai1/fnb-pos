import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const IMAGE_URL = `/media/product-images/0199f000-0000-7000-8000-000000000001/${"c0ff".repeat(16)}.webp`;
const ADDRESS = `/api${IMAGE_URL}`;

/** Cache Storage as a browser keeps it: across page loads, whatever the network does. */
function keptCaches() {
  const kept = new Map<string, Response>();
  const cache = {
    match: async (key: string) => kept.get(key)?.clone(),
    put: async (key: string, response: Response) => {
      kept.set(key, response);
    },
  };
  return { open: async () => cache, kept };
}

/** The module as a freshly loaded page has it (nothing read yet this page). */
const freshPage = async () => {
  vi.resetModules();
  return import("./product-photo-cache");
};

let caches: ReturnType<typeof keptCaches>;
const network = vi.fn<(address: string) => Promise<Response>>();

beforeEach(() => {
  caches = keptCaches();
  vi.stubGlobal("caches", caches);
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:photo" }));
  network.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const photoBytes = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe("a product photo on a till", () => {
  it("is fetched once, kept, and drawn from the kept copy", async () => {
    network.mockResolvedValue(photoBytes());
    const page = await freshPage();
    expect(await page.photoSource(IMAGE_URL)).toBe("blob:photo");
    expect(await page.photoSource(IMAGE_URL)).toBe("blob:photo");
    expect(network).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledWith(ADDRESS);
    expect(caches.kept.has(ADDRESS)).toBe(true);
  });

  it("is still drawn after a reload with no network at all", async () => {
    network.mockResolvedValue(photoBytes());
    await (await freshPage()).photoSource(IMAGE_URL);
    network.mockReset();
    network.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await (await freshPage()).photoSource(IMAGE_URL)).toBe("blob:photo");
    expect(network).not.toHaveBeenCalled();
  });

  it("is not drawn (the initials stay) when never kept and the network is gone", async () => {
    network.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect((await freshPage()).photoSource(IMAGE_URL)).rejects.toThrow();
  });

  it("keeps nothing the server refused, and asks again on the next draw", async () => {
    network.mockResolvedValueOnce(new Response("", { status: 404 }));
    const page = await freshPage();
    await expect(page.photoSource(IMAGE_URL)).rejects.toThrow("404");
    expect(caches.kept.size).toBe(0);
    network.mockResolvedValueOnce(photoBytes());
    expect(await page.photoSource(IMAGE_URL)).toBe("blob:photo");
  });

  it("uses the address as it is where the browser has no Cache Storage", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await (await freshPage()).photoSource(IMAGE_URL)).toBe(ADDRESS);
    expect(network).not.toHaveBeenCalled();
  });
});
