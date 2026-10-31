/**
 * AVIF encoder entry point, loaded at runtime from /public.
 *
 * Why not import the npm package? The encoder ships a 3.4 MB WebAssembly
 * binary, and Turbopack's production build stalls while bundling it (the dev
 * server is fine). Serving the same Squoosh encoder as static files keeps the
 * bundler out of it entirely: nothing is fetched until a visitor actually
 * picks AVIF, and the wasm then streams straight into the page.
 *
 * The glue (`avif_enc.js`) locates `avif_enc.wasm` next to itself via
 * `import.meta.url`, so no path configuration is needed.
 */
import Module from "./avif_enc.js";
import { defaultOptions } from "./meta.js";

/** @type {Promise<any> | null} */
let ready = null;

function load() {
  if (!ready) {
    ready = Module({ noInitialRun: true });
  }
  return ready;
}

/**
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} image
 * @param {{ quality?: number }} [options]
 * @returns {Promise<ArrayBuffer>}
 */
export async function encode(image, options = {}) {
  const merged = { ...defaultOptions, ...options };
  if (merged.bitDepth !== 8 && merged.bitDepth !== 10 && merged.bitDepth !== 12) {
    throw new Error("AVIF bit depth must be 8, 10 or 12");
  }

  const encoder = await load();
  const output = encoder.encode(
    new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    image.width,
    image.height,
    merged
  );

  if (!output) throw new Error("AVIF encoding failed");
  return output.buffer;
}

export default encode;
