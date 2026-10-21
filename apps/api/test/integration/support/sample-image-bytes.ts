import { crc32, deflateSync } from "node:zlib";

/*
 * Small images built byte by byte, for tests of what the server accepts: a real PNG any
 * browser draws, and the headers of the other formats with a chosen size.
 */

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
}

/** A decodable RGB PNG of one colour; `seed` changes the colour, and so the bytes. */
export function solidPng(width: number, height: number, seed = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([(seed * 37) % 256, 120, 90], 1 + x * 3);
  const rows = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A JPEG's first segments up to its frame header (baseline), padded to `bytes`. */
export function jpegHeader(width: number, height: number, bytes = 64): Buffer {
  const app0 = [
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from("JFIF\0", "ascii"),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ];
  const frame = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff];
  const head = Buffer.from([0xff, 0xd8, ...app0, ...frame]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - head.length))]);
}

/** An extended (VP8X) WebP header of the given canvas, padded to `bytes`. */
export function webpHeader(width: number, height: number, bytes = 64): Buffer {
  const head = Buffer.alloc(30);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(bytes - 8, 4);
  head.write("WEBPVP8X", 8, "ascii");
  head.writeUInt32LE(10, 16);
  head.writeUIntLE(width - 1, 24, 3);
  head.writeUIntLE(height - 1, 27, 3);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - head.length))]);
}
