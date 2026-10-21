import { describe, expect, it } from "vitest";
import { readImageFacts } from "./image-format";
import { PRODUCT_IMAGE_LIMITS, checkProductImage } from "./product-image-rules";
import {
  jpegHeader,
  solidPng,
  webpHeader,
} from "../../test/integration/support/sample-image-bytes";

const ascii = (text: string) => Buffer.from(text, "utf8");

describe("what a photo is, read from its bytes", () => {
  it("reads the format and size of a PNG, a JPEG and each kind of WebP", () => {
    expect(readImageFacts(solidPng(40, 30))).toEqual({ extension: "png", width: 40, height: 30 });
    expect(readImageFacts(jpegHeader(800, 600))).toEqual({
      extension: "jpg",
      width: 800,
      height: 600,
    });
    expect(readImageFacts(webpHeader(640, 480))).toEqual({
      extension: "webp",
      width: 640,
      height: 480,
    });
    const lossy = Buffer.alloc(40);
    lossy.write("RIFF", 0, "ascii");
    lossy.write("WEBPVP8 ", 8, "ascii");
    lossy.set([0x9d, 0x01, 0x2a], 23);
    lossy.writeUInt16LE(300, 26);
    lossy.writeUInt16LE(200, 28);
    expect(readImageFacts(lossy)).toEqual({ extension: "webp", width: 300, height: 200 });
    const lossless = Buffer.alloc(40);
    lossless.write("RIFF", 0, "ascii");
    lossless.write("WEBPVP8L", 8, "ascii");
    lossless[20] = 0x2f;
    lossless.writeUInt32LE((120 - 1) | ((90 - 1) << 14), 21);
    expect(readImageFacts(lossless)).toEqual({ extension: "webp", width: 120, height: 90 });
  });

  it("finds a JPEG's frame after other segments and fill bytes", () => {
    const comment = [0xff, 0xfe, 0x00, 0x06, 0x61, 0x62, 0x63, 0x64];
    const plain = jpegHeader(320, 240);
    const longer = Buffer.concat([
      plain.subarray(0, 2),
      Buffer.from([...comment, 0xff]),
      plain.subarray(2),
    ]);
    expect(readImageFacts(longer)).toEqual({ extension: "jpg", width: 320, height: 240 });
  });

  it("refuses what only claims to be an image: SVG, HTML, GIF, a cut-off header", () => {
    expect(readImageFacts(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(readImageFacts(ascii("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(readImageFacts(ascii("GIF89a\u0001\u0000\u0001\u0000"))).toBeNull();
    expect(readImageFacts(solidPng(10, 10).subarray(0, 20))).toBeNull();
    expect(readImageFacts(jpegHeader(800, 600).subarray(0, 24))).toBeNull();
    expect(readImageFacts(Buffer.alloc(0))).toBeNull();
  });
});

describe("which photos a product may have", () => {
  it("takes a photo of a reasonable size and refuses one too small or too large a canvas", () => {
    expect(checkProductImage(solidPng(16, 16)).ok).toBe(true);
    expect(checkProductImage(webpHeader(2048, 1536)).ok).toBe(true);
    expect(checkProductImage(solidPng(15, 40))).toMatchObject({ ok: false, status: 422 });
    expect(checkProductImage(webpHeader(2049, 100))).toMatchObject({
      ok: false,
      code: "API_MEDIA_DIMENSIONS_NOT_ALLOWED",
    });
  });

  it("refuses more bytes than the limit, however well formed", () => {
    const limit = PRODUCT_IMAGE_LIMITS.maxBytes;
    expect(checkProductImage(webpHeader(800, 600, limit)).ok).toBe(true);
    expect(checkProductImage(webpHeader(800, 600, limit + 1))).toEqual({
      ok: false,
      status: 413,
      code: "API_MEDIA_TOO_LARGE",
    });
  });

  it("refuses bytes of another format with the type code", () => {
    expect(checkProductImage(ascii("not an image"))).toEqual({
      ok: false,
      status: 415,
      code: "API_MEDIA_UNSUPPORTED_TYPE",
    });
  });
});
