import { API_BASE } from "./api-base";

/**
 * Product photos kept for a till that loses the network. A photo's address names its bytes
 * (their hash), so a copy never goes stale. Copies of replaced photos are not removed yet:
 * a few dozen KB each, they matter only after years of menu changes.
 *
 * Cache Storage rather than the browser's HTTP cache alone: the HTTP cache is the browser's
 * to evict (and a WebView's to clear) whenever it likes, while what is put here stays until
 * the app removes it, and it is read without any request at all, so a till with no network
 * draws the same tiles as before. Where Cache Storage does not exist (a page served over
 * plain HTTP from a LAN address, the test DOM) the address is used as it is and the
 * server's immutable caching is what is left.
 */
export const PHOTO_CACHE = "fnb-product-photos-v1";

/** Where the till loads a photo the menu names (`/media/…`, relative to the API). */
export const photoAddress = (imageUrl: string): string => `${API_BASE}${imageUrl}`;

const loaded = new Map<string, Promise<string>>();

async function cachedObjectUrl(address: string): Promise<string> {
  const cache = await caches.open(PHOTO_CACHE);
  let response = await cache.match(address);
  if (response === undefined) {
    const fetched = await fetch(address);
    if (!fetched.ok) throw new Error(`photo answered ${fetched.status}`);
    await cache.put(address, fetched.clone());
    response = fetched;
  }
  return URL.createObjectURL(await response.blob());
}

/**
 * What an <img> of the photo should load: an object URL of the kept copy, fetched and kept
 * the first time. Rejects when the photo can be neither found nor fetched; the tile then
 * draws its initials. Each photo is read once per page, however many tiles show it.
 */
export function photoSource(imageUrl: string): Promise<string> {
  const address = photoAddress(imageUrl);
  if (typeof caches === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(address);
  }
  let source = loaded.get(address);
  if (source === undefined) {
    source = cachedObjectUrl(address).catch((error: unknown) => {
      loaded.delete(address);
      throw error;
    });
    loaded.set(address, source);
  }
  return source;
}
