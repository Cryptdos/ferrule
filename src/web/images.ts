/**
 * Pictures into the project: read a pasted or dropped image and keep it at
 * a size that prints sharp on A4 without making the project file huge.
 */
import type { Asset } from "../core/model";

/** Longest side kept, in pixels: about 300 dpi across a 200 mm drawing. */
const MAX_PX = 2400;
/** Files larger than this are refused outright. */
const MAX_BYTES = 25 * 1024 * 1024;

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that picture"));
    r.readAsDataURL(blob);
  });
}

export async function readImage(blob: Blob): Promise<Asset> {
  if (blob.size > MAX_BYTES) throw new Error("That picture is too large (over 25 MB)");
  const name = blob instanceof File ? blob.name : undefined;
  // Vector logos stay vector.
  if (blob.type === "image/svg+xml") {
    const data = await asDataUrl(blob);
    const img = new Image();
    img.src = data;
    await img.decode().catch(() => {});
    return { data, w: img.naturalWidth || 400, h: img.naturalHeight || 200, ...(name ? { name } : {}) };
  }
  const bmp = await createImageBitmap(blob).catch(() => {
    throw new Error("That file isn't a picture Ferrule can read (PNG, JPEG, GIF, WebP or SVG)");
  });
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  if (k === 1 && (blob.type === "image/png" || blob.type === "image/jpeg") && blob.size < 1.5 * 1024 * 1024) {
    bmp.close();
    return { data: await asDataUrl(blob), w, h, ...(name ? { name } : {}) };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // Keep PNG where there may be transparency (logos); photos go to JPEG.
  const transparent = blob.type === "image/png" || blob.type === "image/gif" || blob.type === "image/webp";
  const data = transparent ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
  return { data, w, h, ...(name ? { name } : {}) };
}
