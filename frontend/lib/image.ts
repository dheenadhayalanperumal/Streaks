/**
 * Client-side image handling for the upload fields (brand logo, reward image).
 *
 * Images are stored inline as `data:` URIs rather than on a file host, so every
 * upload is downscaled first — a 4 MB phone photo becomes a ~40 KB square that
 * is cheap to ship inside the reward payload the check-in page fetches.
 */

import { LIMITS } from "./validation";

/** Longest edge, in px, that an uploaded image is reduced to. */
const MAX_EDGE = 512;

/**
 * Read a picked file and return a compact `data:` URI.
 *
 * Every accepted format is drawn to a canvas at no more than MAX_EDGE on its
 * longest side and re-encoded as WebP, falling back to PNG on browsers that
 * decline the format. Nothing is passed through untouched — the re-encode is
 * what guarantees the stored bytes are really an image, so a file with a
 * spoofed MIME type fails here rather than reaching the database.
 *
 * Rejects with an `Error` whose message is safe to show to the user.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file);
  const shrunk = await downscale(raw);
  if (shrunk.length > LIMITS.imageBytes) {
    throw new Error("Image is too large even after resizing. Try a smaller file.");
  }
  return shrunk;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function downscale(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not process that image."));
      ctx.drawImage(img, 0, 0, w, h);

      const webp = canvas.toDataURL("image/webp", 0.85);
      resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("That file is not a readable image."));
    img.src = dataUrl;
  });
}
