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
2. A 160px proxy is turned into an **attention map** from four signals: fine edges, coarse edges (blurred then Sobel, so a face outline counts more than skin texture), saturation, and skin probability (YCbCr + RGB rules). If the image has real transparency, alpha becomes the subject mask instead.
3. Every candidate crop is scored by summed attention × a center prior, **minus a penalty for energy on the window border** — so a window that slices a face scores worse than one that contains it. A coarse grid is then refined with three shrinking neighbourhood passes. The best window maps back to full resolution.
4. Presets render in batches of four `OffscreenCanvas` draws; big reductions are halved repeatedly before the final draw.
5. Results are cached as blobs, so a single download is instant and "Download all" only zips bytes that already exist.

Click **crop** on any image to drop a focal point manually — every size re-crops around it, nothing else changes.

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
