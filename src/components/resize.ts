// Resizing pictures in the browser before upload (DECISIONS #93). The picture is decoded,
// drawn to a canvas with its long side at most RESIZE_LONG_SIDE (never enlarged) and saved as
// JPEG. Drawing to a canvas keeps only the pixels, so EXIF data, GPS included, is dropped. The
// phone's rotation is applied first, so a portrait photo stays upright. Transparent areas
// (PNG, WebP) become white, since JPEG has no transparency.
import { RESIZE_LONG_SIDE, RESIZE_QUALITY, resizedSize, UPLOAD_MESSAGES } from "./upload-rules.ts";

export class UnreadablePicture extends Error {
  constructor() {
    super(UPLOAD_MESSAGES.cantRead);
  }
}

export async function resizeForUpload(file: File, longSide = RESIZE_LONG_SIDE): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnreadablePicture();
  }
  try {
    const size = resizedSize(bitmap.width, bitmap.height, longSide);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new UnreadablePicture();
    // Image data, not a UI color: JPEG has no transparency, so transparent pixels become white.
    context.fillStyle = "white";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", RESIZE_QUALITY));
    if (!blob) throw new UnreadablePicture();
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
