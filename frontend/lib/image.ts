const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function validateImage(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Use a JPEG, PNG or WebP image.";
  if (file.size > MAX_INPUT_BYTES) return "Image must be smaller than 10 MB.";
  return null;
}

/** Center-crops to a square and downscales to at most `max` px before upload. */
export async function downscaleImage(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(side, max);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    out,
    out,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("Could not process the image.");
  return blob;
}
