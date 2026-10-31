# sizekit

Seven browser tools for images and video. Resize one photo into 18 social and app presets,
compress to a target size, convert between JPEG, PNG, WebP and AVIF, shrink video with WebCodecs,
build a looping GIF, make a meme, and generate a complete favicon kit.

Everything runs in the tab. No upload, no account, no backend, no telemetry.

## Tools

| Tool | What it does |
| --- | --- |
| **Resize** | 18 presets across Instagram, X, LinkedIn, YouTube, Pinterest, OG cards and app icons. Saliency crop, manual focal point, ZIP download. |
| **Compress** | Quality slider, max edge, optional target size in KB (binary-searched encoder quality), live before/after. |
| **Convert** | Batch JPEG / PNG / WebP / AVIF. Alpha preserved where the format supports it; JPEG and AVIF composite on white. |
| **Video** | MP4/MOV re-encode with WebCodecs: quality → bitrate, resolution cap, audio on/off, live progress, MP4 out. |
| **GIF** | Still sequence → looping GIF with per-frame delay, width cap and 64/128/256-colour palette. |
| **Meme** | Impact-style top and bottom text with automatic wrapping, outline, size and colour. |
| **Favicon** | `.ico` (16/32/48), `apple-touch-icon.png`, Android PNGs, `manifest.webmanifest` and the `<head>` snippet. |

## Stack

- **Next.js 16** (App Router, Turbopack, static output) + **React 19** with **React Compiler**
- **Bun** as package manager and script runner
- **Tailwind CSS v4** with a small token layer in `src/app/globals.css`
- Rendering: `OffscreenCanvas` on the main thread and inside `public/resize.worker.js`
- Encoding: the browser's own `toBlob`, plus Squoosh's AVIF encoder (WASM) served from `/public/vendor/avif`
  because no browser encodes AVIF from a canvas
- Video: **WebCodecs** (`VideoDecoder` → canvas → `VideoEncoder`) + **mp4-muxer**, demuxed with **mp4box**
- GIF: **gifenc** (quantise + apply palette + LZW)
- Packaging: **fflate** in store mode — images are already compressed, so deflating them only wastes seconds

## How the resize crop works

1. `createImageBitmap` decodes once per image, capped at 2600px on the long edge.
2. A 160px proxy becomes an **attention map** from four signals: fine edges, coarse edges (blurred then
   Sobel, so a face outline counts more than skin texture), saturation, and skin probability
   (YCbCr + RGB rules). If the image has real transparency, alpha becomes the subject mask instead.
3. Every candidate crop is scored by summed attention × a centre prior, **minus a penalty for energy on
   the window border** — a window that slices a face scores worse than one that contains it. A coarse
   grid is then refined with three shrinking neighbourhood passes, and the winner maps back to full
   resolution.
4. Transparent cut-outs are fitted, never cropped. Presets render in batches of four, and big reductions
   are halved repeatedly before the final draw.
5. Results are cached as blobs, so a single download is instant and "Download all" only zips bytes that
   already exist.

Click **crop** on any image to drop a focal point manually — every size re-crops around it.

## How the video compressor works

1. `mp4box` demuxes the MP4/MOV into samples and pulls the `avcC`/`hvcC` description out of `stsd`.
2. `VideoDecoder` decodes on the GPU; each frame is drawn into a canvas at the target size (source,
   1080p, 720p or 480p) and wrapped in a new `VideoFrame`.
3. `VideoEncoder` re-encodes at a bitrate derived from quality (`bpp = 0.018 + quality × 0.09`), with
   both queues bounded so a long clip cannot balloon memory.
4. `mp4-muxer` writes a fresh MP4 in memory with `firstTimestampBehavior: "offset"`, because B-frame
   sources rarely start at presentation time 0.
5. Audio is decoded with WebAudio and re-encoded to AAC when the platform has an AAC encoder; otherwise
   the clip is exported without sound and the UI says so before you start.

## Why the AVIF encoder lives in `/public`

The AVIF encoder is Squoosh's, packaged by `@jsquash/avif`. Importing it normally puts a 3.4 MB
`.wasm` binary into the module graph — which is fine in dev but makes Turbopack's production build
stall indefinitely at "Creating an optimized production build" (no error, workers idle).

So `public/vendor/avif/` holds the encoder as plain static files (`avif_enc.js`, `avif_enc.wasm`,
`meta.js`) plus a 40-line `encode.mjs` wrapper, and `src/lib/image.ts` loads it with a runtime
`import()` of `/vendor/avif/encode.mjs`. The bundler never sees it, nothing is downloaded until a
visitor picks AVIF, and the wasm streams in afterwards. `@jsquash/avif` stays a dev dependency only
so `bun run vendor:avif` can refresh the copy from upstream.

## SEO / GEO

- `metadata` in `src/app/layout.tsx`: canonical, Open Graph, Twitter card, keywords, author.
- Static assets: `public/og.png` (1200×630), `src/app/favicon.ico`, `src/app/icon.svg`,
  `src/app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png`.
- Routes: `sitemap.xml`, `robots.txt` (explicitly allows GPTBot, ClaudeBot, PerplexityBot and friends),
  `manifest.webmanifest`.
- `public/llms.txt` summarises the product for answer engines.
- JSON-LD: `SoftwareApplication`, `WebSite`, `Person` (with `sameAs` social profiles) and `FAQPage`.

## Scripts

```bash
bun install
bun run dev     # http://localhost:3000
bun run build   # static production build
bun run lint
bun run vendor:avif  # re-copy the AVIF encoder from @jsquash/avif into /public
```

## Layout

```
public/resize.worker.js        worker: decode → saliency → render → encode
src/lib/image.ts               format table, encode helpers, target-size search, AVIF WASM bridge
src/lib/video.ts               WebCodecs compress pipeline
src/lib/presets.ts             the whole preset table (add a platform = one line)
src/lib/faq.ts                 FAQ copy, shared by the page and the JSON-LD
src/lib/site.ts                brand, author, social links, tool metadata
src/components/tools/*.tsx     one component per tool
src/components/tool-switcher.tsx  tab host, keeps mounted tools alive
src/app/**/page.tsx            landing page and legal pages
public/vendor/avif/            static AVIF encoder (kept out of the bundler on purpose)
```

## Roadmap

- [ ] HEIC input (lazy decoder) with a clear fallback message
- [ ] Trim and crop controls in the video tool
- [ ] Custom size input and per-preset overrides
- [ ] Tests for the crop math in a plain DOM worker harness
