export type OutFormat = "jpeg" | "png" | "webp" | "avif";

export const FORMATS: {
  value: OutFormat;
  label: string;
  mime: string;
  lossy: boolean;
  alpha: boolean;
  note: string;
}[] = [
  { value: "jpeg", label: "JPEG", mime: "image/jpeg", lossy: true, alpha: false, note: "Universal, smallest for photos, no transparency" },
  { value: "png", label: "PNG", mime: "image/png", lossy: false, alpha: true, note: "Lossless, transparency, largest files" },
  { value: "webp", label: "WebP", mime: "image/webp", lossy: true, alpha: true, note: "~30% smaller than JPEG at the same look" },
  { value: "avif", label: "AVIF", mime: "image/avif", lossy: true, alpha: false, note: "Smallest files, slowest encode. Transparency is flattened to white." },
];

export function formatInfo(format: OutFormat) {
  return FORMATS.find((entry) => entry.value === format) ?? FORMATS[0];
}

export function extensionFor(blob: Blob, fallback: OutFormat = "jpeg"): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  };
  return map[blob.type] ?? (fallback === "jpeg" ? "jpg" : fallback);
}

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function fitSize(width: number, height: number, maxEdge?: number) {
  if (!maxEdge || Math.max(width, height) <= maxEdge) return { width, height };
  const scale = maxEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Draw an image (bitmap or canvas) into a canvas, optionally capped on the long edge. */
export function drawCover(
  source: CanvasImageSource & { width: number; height: number },
  maxEdge?: number,
  background?: string
) {
  const { width, height } = fitSize(source.width, source.height, maxEdge);
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

type AvifEncoder = (image: ImageData, options: { quality: number }) => Promise<ArrayBuffer>;

let avifEncoder: Promise<AvifEncoder> | null = null;

/**
 * Browsers can decode AVIF but almost none can encode it from a canvas, so
 * AVIF goes through a small WASM encoder (Squoosh's). It is served from
 * /public and loaded at runtime: the 3.4 MB binary never enters the bundler,
 * and nothing is downloaded until a visitor actually chooses AVIF.
 */
function loadAvifEncoder(): Promise<AvifEncoder> {
  if (!avifEncoder) {
    const url = "/vendor/avif/encode.mjs";
    avifEncoder = import(/* turbopackIgnore: true */ url).then((module) => {
      const encode = (module.default ?? module.encode) as AvifEncoder | undefined;
      if (typeof encode !== "function") {
        throw new Error("The AVIF encoder could not be loaded");
      }
      return encode;
    });
    // A failed fetch must not be cached forever: drop it so the next try can reload.
    avifEncoder.catch(() => {
      avifEncoder = null;
    });
  }
  return avifEncoder;
}

async function encodeAvif(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const encode = await loadAvifEncoder();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read the canvas");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buffer = await encode(data, {
    quality: Math.round(Math.min(1, Math.max(0.05, quality)) * 100),
  });
  return new Blob([buffer], { type: "image/avif" });
}

export async function toBlob(
  canvas: HTMLCanvasElement,
  format: OutFormat,
  quality = 0.9
): Promise<Blob> {
  if (format === "avif") return encodeAvif(canvas, quality);

  const mime = formatInfo(format).mime;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser could not encode that format"))),
      mime,
      format === "png" ? undefined : quality
    );
  });
}

const supportCache = new Map<string, boolean>();

export async function supportsFormat(format: OutFormat): Promise<boolean> {
  // AVIF is encoded by a bundled WASM encoder, so it never depends on the
  // browser's canvas support.
  if (format === "avif") return true;

  const mime = formatInfo(format).mime;
  if (supportCache.has(mime)) return supportCache.get(mime)!;
  const canvas = canvasOf(2, 2);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.8));
  const supported = !!blob && blob.type === mime;
  supportCache.set(mime, supported);
  return supported;
}

/**
 * Binary-search the encoder quality so the result lands under `targetBytes`.
 * If nothing fits, the smallest encode found is returned with `met: false` so
 * the UI can say so instead of quietly handing back the biggest file.
 */
export async function encodeToTarget(
  canvas: HTMLCanvasElement,
  format: OutFormat,
  targetBytes: number
): Promise<{ blob: Blob; quality: number; met: boolean }> {
  let low = 0.25;
  let high = 0.98;
  let best = await toBlob(canvas, format, high);
  let bestQuality = high;

  if (best.size <= targetBytes) return { blob: best, quality: high, met: true };

  for (let i = 0; i < 7; i++) {
    const quality = (low + high) / 2;
    const blob = await toBlob(canvas, format, quality);
    if (blob.size <= targetBytes) {
      best = blob;
      bestQuality = quality;
      low = quality;
    } else {
      high = quality;
      if (blob.size < best.size) {
        best = blob;
        bestQuality = quality;
      }
    }
  }

  return { blob: best, quality: bestQuality, met: best.size <= targetBytes };
}
