/** The formats a product photo may be stored in, by the extension its file is named with. */
export type ImageExtension = "jpg" | "png" | "webp";

export interface ImageFacts {
  extension: ImageExtension;
  width: number;
  height: number;
}

export const IMAGE_CONTENT_TYPES: Readonly<Record<ImageExtension, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * What the bytes are, read from the bytes alone: the name and content type a client sends
 * are not trusted, since a page renamed to .png is still a page. Null for anything that is
 * not a JPEG, PNG or WebP whose size can be read from its header (SVG, GIF, HEIC, a
 * truncated file…). Nothing is decoded: the server only stores and serves the bytes.
 */
export function readImageFacts(bytes: Uint8Array): ImageFacts | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(bytes, PNG_SIGNATURE)) {
    // The IHDR chunk always comes first: length, "IHDR", width, height (big-endian).
    if (bytes.length < 24 || !startsWith(bytes, ascii("IHDR"), 12)) return null;
    return sized("png", view.getUint32(16), view.getUint32(20));
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return jpegFacts(bytes, view);
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return webpFacts(bytes, view);
  }
  return null;
}

function sized(extension: ImageExtension, width: number, height: number): ImageFacts | null {
  return width > 0 && height > 0 ? { extension, width, height } : null;
}

// Start-of-frame markers carry the size; C4 (Huffman tables), C8 and CC are not frames.
const START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Walks the JPEG's marker segments to the first frame header. */
function jpegFacts(bytes: Uint8Array, view: DataView): ImageFacts | null {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    const length = view.getUint16(at + 2);
    if (START_OF_FRAME.has(marker)) {
      if (at + 9 > bytes.length) return null;
      return sized("jpg", view.getUint16(at + 7), view.getUint16(at + 5));
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/** The three WebP flavours keep their size in different places. */
function webpFacts(bytes: Uint8Array, view: DataView): ImageFacts | null {
  if (bytes.length < 30) return null;
  if (startsWith(bytes, ascii("VP8 "), 12)) {
    // Lossy: a key frame's start code, then 14-bit width and height.
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    return sized("webp", view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (startsWith(bytes, ascii("VP8L"), 12)) {
    if (bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return sized("webp", (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (startsWith(bytes, ascii("VP8X"), 12)) {
    const width = (view.getUint32(24, true) & 0xffffff) + 1;
    const height = (view.getUint32(27, true) & 0xffffff) + 1;
    return sized("webp", width, height);
  }
  return null;
}
