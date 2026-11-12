// Shrinks pictures in the browser BEFORE they are uploaded, so a 4 MB phone photo or a 2 MB PNG
// screenshot becomes a ~100-300 KB WebP. Less storage, less bandwidth, faster pages. Re-encoding
// also drops hidden photo metadata such as GPS location.
//
// The helpers at the top are pure (tested in scripts/image-compress-test.ts). compressImage needs
// browser APIs (canvas) and only runs in the browser; if anything goes wrong it returns the
// original file, so an upload never fails because of compression.

export type ImagePreset = "photo" | "avatar" | "logo" | "proof" | "id";

export type CompressOptions = {
  /** Longest side in pixels; bigger pictures are scaled down, smaller ones are never enlarged. */
  maxDimension: number;
  /** 0-1 encoder quality. */
  quality: number;
  /** Logos with see-through areas: never flatten onto a background. */
  keepTransparency?: boolean;
  /** Files this small are uploaded untouched (see "proof" below). */
  skipBelowBytes?: number;
};

export const PRESETS: Record<ImagePreset, CompressOptions> = {
  // Banners, slides, prize photos, gallery pictures.
  photo: { maxDimension: 1600, quality: 0.82 },
  // Profile photos are shown small and round.
  avatar: { maxDimension: 512, quality: 0.85 },
  // Logos and game art: crisp, and transparency kept.
  logo: { maxDimension: 2400, quality: 0.92, keepTransparency: true },
  // Payment screenshots. Duplicate detection compares the exact file, so a file that is already
  // reasonably small is left exactly as the person chose it; only big ones are re-encoded.
  proof: { maxDimension: 1800, quality: 0.85, skipBelowBytes: 1_500_000 },
  // ID documents and student cards: keep small print readable for the reviewer.
  id: { maxDimension: 2200, quality: 0.9 },
};

/** The preset a bucket gets unless the caller names one. */
export function presetForBucket(bucket: string): ImagePreset {
  if (bucket === "payment-proofs") return "proof";
  if (bucket === "identity-documents" || bucket === "institution-proofs") return "id";
  return "photo";
}

/** Formats we re-encode. SVG, GIF (animation) and everything else are uploaded as they are. */
export const COMPRESSIBLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Size after scaling to fit a `max` x `max` box. Never enlarges. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  };
}

/** A file name that is safe in a storage path: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(-80);
  return cleaned || "file";
}

/** `holiday photo.JPG` + image/webp -> `holiday-photo.webp`. */
export function outputName(original: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
  const base = safeFileName(original.replace(/\.[^.]*$/, "")).replace(/\.+$/, "") || "image";
  return `${base}.${ext}`;
}

// ---- browser only from here on ----

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    // "from-image" applies the camera's rotation, so portrait phone photos are not sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

function hasTransparency(source: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 32;
  const ctx = probe.getContext("2d");
  if (!ctx) return true; // unsure: keep it safe
  ctx.drawImage(source, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = source.width;
  flat.height = source.height;
  const ctx = flat.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(source, 0, 0);
  }
  return flat;
}

/** Returns a smaller copy of the picture, or the original file when it cannot or need not be shrunk. */
export async function compressImage(file: File, opts: CompressOptions): Promise<File> {
  try {
    if (!COMPRESSIBLE_TYPES.includes(file.type)) return file;
    if (opts.skipBelowBytes && file.size <= opts.skipBelowBytes) return file;

    const bitmap = await decode(file);
    if (!bitmap) return file;
    const { width, height } = fitWithin(bitmap.width, bitmap.height, opts.maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    let blob = await toBlob(canvas, "image/webp", opts.quality);
    if (!blob || blob.type !== "image/webp") {
      // This browser cannot write WebP (older Safari): JPEG for solid pictures,
      // and leave pictures with see-through areas alone.
      const solid = !opts.keepTransparency && !hasTransparency(canvas);
      blob = solid ? await toBlob(flattenOnWhite(canvas), "image/jpeg", opts.quality) : null;
    }
    // Never swap a file for a bigger one.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], outputName(file.name, blob.type), { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
