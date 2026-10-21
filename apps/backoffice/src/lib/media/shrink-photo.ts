/** The long side a product photo is sent at: sharp on a till's tile, ~50–150 KB as WebP. */
export const PHOTO_LONG_SIDE = 800;
const WEBP_QUALITY = 0.82;

/** The size a `width` × `height` photo is drawn at: its long side at most `longSide`. */
export function shrunkSize(width: number, height: number, longSide = PHOTO_LONG_SIDE) {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Why a file could not be made into a photo to send. */
export class PhotoUnreadableError extends Error {
  constructor() {
    super("the file could not be read as a photo");
    this.name = "PhotoUnreadableError";
  }
}

/**
 * The photo redrawn on a canvas at most 800px on its long side and encoded as WebP. Drawing
 * it anew keeps only its pixels: EXIF (the camera, and the place where a phone took it) is
 * not carried over. The browser applies the EXIF rotation while decoding, so the photo
 * stays the right way up. Runs in the browser only.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoUnreadableError();
  }
  const size = shrunkSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new PhotoUnreadableError();
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (blob === null) throw new PhotoUnreadableError();
  return blob;
}
