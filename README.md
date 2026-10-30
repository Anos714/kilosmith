# sizekit

One photo → every size. Drop an image and get correctly cropped files for social, link previews
and app icons. Download the whole set as a ZIP or grab individual files.

Everything runs in the browser tab. No upload, no account, no backend, no telemetry.

## Stack

- **Next.js 16** (App Router, Turbopack, static output) + **React 19** with **React Compiler**
- **Bun** as package manager and script runner
- **Tailwind CSS v4**
- Rendering: `OffscreenCanvas` inside a Web Worker (`public/resize.worker.js`)
- Packaging: `fflate` in **store mode** — images are already compressed, so deflating them only wastes seconds
- Smart crop: a small self-contained saliency pass (Sobel energy → integral image → best window), no ML model, no extra dependency

## How it works

1. `createImageBitmap` decodes once per image, capped at 2600px on the long edge.
2. A 96px proxy is analysed for visual energy; the busiest window for each preset's aspect ratio becomes the crop.
3. Each preset is drawn to its own `OffscreenCanvas` and encoded with `convertToBlob` in small batches, so tiles stream in as they finish.
4. Results are cached as blobs, so a single download is instant and "Download all" only zips bytes that already exist.

## Scripts

```bash
bun install
bun run dev     # http://localhost:3000
bun run build   # static production build
bun run lint
```

## Layout

```
public/resize.worker.js      worker: decode → saliency → render → encode (plain JS, no bundler config)
src/lib/presets.ts           the whole preset table (add a platform = one line)
src/lib/zip.ts               store-mode ZIP + download helpers
src/components/sizekit.tsx   UI, worker queue, blob cache, downloads
src/app/page.tsx             landing page
```

## Roadmap

- [ ] HEIC input (lazy `heic2any`) with a clear fallback message
- [ ] `.ico` + `manifest.json` inside the icon bundle
- [ ] Custom size input and per-preset overrides
- [ ] Two-pass downscale when the reduction factor is above 3×
- [ ] One-time Pro license (batch ZIP) via Lemon Squeezy
- [ ] Tests for the crop math in a plain DOM worker harness
