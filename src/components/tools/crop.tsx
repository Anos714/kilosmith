"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, DropZone, Field, Panel, Segmented } from "@/components/ui";
import { IconClose, IconDownload } from "@/components/icons";
import {
  FORMATS,
  canvasOf,
  decodeImage,
  extensionFor,
  formatInfo,
  supportsFormat,
  toBlob,
  type OutFormat,
} from "@/lib/image";
import { formatBytes, slug } from "@/lib/format";
import { saveBlob } from "@/lib/zip";

type Picture = { bitmap: ImageBitmap; name: string };
type Crop = { x: number; y: number; w: number; h: number };

const PREVIEW_EDGE = 1600;
const EXPORT_EDGE = 6000;
const MIN_CROP = 0.04;

const ASPECTS = [
  { id: "free", label: "Free" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "2:3", label: "2:3", ratio: 2 / 3 },
] as const;

type AspectId = (typeof ASPECTS)[number]["id"];

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

function rotatedDims(width: number, height: number, quarter: number, straighten: number) {
  const rad = ((quarter * 90 + straighten) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

/**
 * Quarter turns, straightening and flips are rasterised once into a canvas in
 * "rotated space". The crop box lives in that space, which keeps the export
 * maths to a single drawImage — no transform bookkeeping at export time.
 */
function rotatedCanvas(
  bitmap: ImageBitmap,
  quarter: number,
  straighten: number,
  flipH: boolean,
  flipV: boolean,
  maxEdge: number
) {
  const rad = ((quarter * 90 + straighten) * Math.PI) / 180;
  const { width: boxW, height: boxH } = rotatedDims(
    bitmap.width,
    bitmap.height,
    quarter,
    straighten
  );
  const scale = Math.min(1, maxEdge / Math.max(boxW, boxH));
  const canvas = canvasOf(boxW * scale, boxH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  return canvas;
}

/** Largest centred crop with the requested pixel aspect, or the full frame. */
function cropForAspect(aspect: AspectId, width: number, height: number): Crop {
  const rule = ASPECTS.find((entry) => entry.id === aspect);
  if (!rule || !("ratio" in rule)) return { ...FULL };
  // crop.w / crop.h in normalised space for the requested pixel aspect.
  const normalized = (rule.ratio * height) / width;
  if (normalized <= 1) {
    return { x: (1 - normalized) / 2, y: 0, w: normalized, h: 1 };
  }
  const h = 1 / normalized;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

function paintPreview(canvas: HTMLCanvasElement, image: HTMLCanvasElement, crop: Crop) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  const x = crop.x * w;
  const y = crop.y * h;
  const cw = crop.w * w;
  const ch = crop.h * h;

  ctx.save();
  ctx.fillStyle = "rgba(6,8,10,0.62)";
  ctx.fillRect(0, 0, w, y);
  ctx.fillRect(0, y + ch, w, h - y - ch);
  ctx.fillRect(0, y, x, ch);
  ctx.fillRect(x + cw, y, w - x - cw, ch);

  const k = Math.max(1, w / 700);

  ctx.strokeStyle = "rgba(216,255,62,0.9)";
  ctx.lineWidth = 2 * k;
  ctx.strokeRect(x + k, y + k, Math.max(0, cw - 2 * k), Math.max(0, ch - 2 * k));

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1 * k;
  ctx.beginPath();
  for (let step = 1; step < 3; step++) {
    ctx.moveTo(x + (cw * step) / 3, y);
    ctx.lineTo(x + (cw * step) / 3, y + ch);
    ctx.moveTo(x, y + (ch * step) / 3);
    ctx.lineTo(x + cw, y + (ch * step) / 3);
  }
  ctx.stroke();

  const arm = Math.min(26 * k, cw / 3, ch / 3);
  ctx.strokeStyle = "#d8ff3e";
  ctx.lineWidth = 5 * k;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(x, y + arm);
  ctx.lineTo(x, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x + cw - arm, y);
  ctx.lineTo(x + cw, y);
  ctx.lineTo(x + cw, y + arm);
  ctx.moveTo(x + cw, y + ch - arm);
  ctx.lineTo(x + cw, y + ch);
  ctx.lineTo(x + cw - arm, y + ch);
  ctx.moveTo(x + arm, y + ch);
  ctx.lineTo(x, y + ch);
  ctx.lineTo(x, y + ch - arm);
  ctx.stroke();
  ctx.restore();
}

export default function CropTool() {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [quarter, setQuarter] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<Crop>({ ...FULL });
  const [aspect, setAspect] = useState<AspectId>("free");
  const [format, setFormat] = useState<OutFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [supported, setSupported] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotatedRef = useRef<HTMLCanvasElement | null>(null);
  const cropRef = useRef<Crop>(crop);
  const dragRef = useRef<{ mode: "move" | "corner"; corner: number; dx: number; dy: number } | null>(
    null
  );

  const info = formatInfo(format);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        FORMATS.map(async (entry) => [entry.value, await supportsFormat(entry.value)] as const)
      );
      if (alive) setSupported(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!picture) return;
    const rotated = rotatedCanvas(
      picture.bitmap,
      quarter,
      straighten,
      flipH,
      flipV,
      PREVIEW_EDGE
    );
    rotatedRef.current = rotated;
    const canvas = canvasRef.current;
    if (canvas) paintPreview(canvas, rotated, cropRef.current);
  }, [picture, quarter, straighten, flipH, flipV]);

  useEffect(() => {
    cropRef.current = crop;
    const canvas = canvasRef.current;
    const rotated = rotatedRef.current;
    if (canvas && rotated) paintPreview(canvas, rotated, crop);
  }, [crop]);

  function sourceDims(pic: Picture, q = quarter, angle = straighten) {
    return rotatedDims(pic.bitmap.width, pic.bitmap.height, q, angle);
  }

  function applyAspect(next: AspectId, pic = picture, q = quarter, angle = straighten) {
    if (!pic) return;
    const dims = sourceDims(pic, q, angle);
    setAspect(next);
    setCrop(cropForAspect(next, dims.width, dims.height));
  }

  async function adopt(pic: Picture) {
    const dims = sourceDims(pic);
    setPicture(pic);
    setQuarter(0);
    setStraighten(0);
    setFlipH(false);
    setFlipV(false);
    setAspect("free");
    setCrop(cropForAspect("free", dims.width, dims.height));
    setNote(null);
  }

  async function onFiles(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith("image/"));
    if (!file) return;
    try {
      const bitmap = await decodeImage(file);
      await adopt({ bitmap, name: file.name.replace(/\.[a-z0-9]+$/i, "") });
    } catch {
      setNote("That file could not be decoded as an image.");
    }
  }

  function turn(delta: number) {
    if (!picture) return;
    const next = (((quarter + delta) % 4) + 4) % 4;
    setQuarter(next);
    applyAspect(aspect, picture, next, straighten);
  }

  function flip(axis: "h" | "v") {
    if (!picture) return;
    if (axis === "h") setFlipH((value) => !value);
    else setFlipV((value) => !value);
  }

  async function download() {
    if (!picture) return;
    try {
      const full = rotatedCanvas(
        picture.bitmap,
        quarter,
        straighten,
        flipH,
        flipV,
        EXPORT_EDGE
      );
      const sx = Math.round(crop.x * full.width);
      const sy = Math.round(crop.y * full.height);
      const sw = Math.max(1, Math.round(crop.w * full.width));
      const sh = Math.max(1, Math.round(crop.h * full.height));
      const out = canvasOf(sw, sh);
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not read the canvas");
      if (!info.alpha) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);

      const blob = await toBlob(out, format, quality / 100);
      saveBlob(blob, `${slug(picture.name)}-crop.${extensionFor(blob, format)}`);
      setNote(`Saved ${out.width}×${out.height} ${info.label} · ${formatBytes(blob.size)}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not export this crop.");
    }
  }

  /* --------------------------------- pointer -------------------------------- */

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      width: canvas.width,
      height: canvas.height,
      scale: canvas.width / rect.width,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    const { x, y, w, h } = crop;
    const px = point.x / point.width;
    const py = point.y / point.height;
    const tol = (18 * point.scale) / point.width;

    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const corner = corners.findIndex(
      (entry) => Math.abs(entry.x - px) <= tol && Math.abs(entry.y - py) <= tol
    );

    if (corner >= 0) {
      dragRef.current = { mode: "corner", corner, dx: 0, dy: 0 };
    } else if (px >= x && px <= x + w && py >= y && py <= y + h) {
      dragRef.current = { mode: "move", corner: 0, dx: px - x, dy: py - y };
    } else {
      return;
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Dragging still works without pointer capture.
    }
    event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = canvasPoint(event);
    const px = Math.min(1, Math.max(0, point.x / point.width));
    const py = Math.min(1, Math.max(0, point.y / point.height));

    if (drag.mode === "move") {
      setCrop((current) => ({
        ...current,
        x: Math.min(1 - current.w, Math.max(0, px - drag.dx)),
        y: Math.min(1 - current.h, Math.max(0, py - drag.dy)),
      }));
      return;
    }

    const anchorX = drag.corner === 0 || drag.corner === 3 ? crop.x + crop.w : crop.x;
    const anchorY = drag.corner === 0 || drag.corner === 1 ? crop.y + crop.h : crop.y;
    const extendsRight = drag.corner === 0 || drag.corner === 3;
    const extendsDown = drag.corner === 0 || drag.corner === 1;

    let w = Math.max(MIN_CROP, Math.abs(px - anchorX));
    let h = Math.max(MIN_CROP, Math.abs(py - anchorY));

    const rule = ASPECTS.find((entry) => entry.id === aspect);
    if (rule && "ratio" in rule) {
      const dims = rotatedRef.current;
      if (dims) {
        // crop.w / crop.h must equal ratio × height / width in pixel terms.
        const normalized = (rule.ratio * dims.height) / dims.width;
        h = w / normalized;
        const maxW = extendsRight ? 1 - anchorX : anchorX;
        const maxH = extendsDown ? 1 - anchorY : anchorY;
        if (h > maxH) {
          h = maxH;
          w = h * normalized;
        }
        if (w > maxW) {
          w = maxW;
          h = w / normalized;
        }
      }
    }

    const x = extendsRight ? anchorX : anchorX - w;
    const y = extendsDown ? anchorY : anchorY - h;
    setCrop({
      x: Math.max(0, Math.min(1 - w, x)),
      y: Math.max(0, Math.min(1 - h, y)),
      w: Math.max(MIN_CROP, Math.min(1, w)),
      h: Math.max(MIN_CROP, Math.min(1, h)),
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // ignore
      }
    }
  }

  /* ---------------------------------- view ---------------------------------- */

  if (!picture) {
    return (
      <div className="space-y-4">
        <DropZone
          onFiles={onFiles}
          title="Drop an image to crop, rotate and straighten"
          hint="Drag the box or its corners. Everything stays in this tab."
        />
        {note && <p className="text-[11px] text-zinc-500">{note}</p>}
      </div>
    );
  }

  const source = sourceDims(picture);
  const exportScale = Math.min(1, EXPORT_EDGE / Math.max(source.width, source.height));
  const outW = Math.max(1, Math.round(crop.w * source.width * exportScale));
  const outH = Math.max(1, Math.round(crop.h * source.height * exportScale));

  return (
    <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <Field label="Rotate">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => turn(-1)}
              className="rounded-md border border-line px-2 py-1.5 font-mono text-[10.5px] text-zinc-300 transition hover:border-line-2 hover:text-zinc-50"
            >
              ⟲ 90°
            </button>
            <button
              type="button"
              onClick={() => turn(1)}
              className="rounded-md border border-line px-2 py-1.5 font-mono text-[10.5px] text-zinc-300 transition hover:border-line-2 hover:text-zinc-50"
            >
              ⟳ 90°
            </button>
            <button
              type="button"
              onClick={() => flip("h")}
              aria-pressed={flipH}
              className={`rounded-md border px-2 py-1.5 font-mono text-[10.5px] transition ${
                flipH
                  ? "border-acid/40 bg-acid/10 text-acid"
                  : "border-line text-zinc-300 hover:border-line-2 hover:text-zinc-50"
              }`}
            >
              flip ↔
            </button>
            <button
              type="button"
              onClick={() => flip("v")}
              aria-pressed={flipV}
              className={`rounded-md border px-2 py-1.5 font-mono text-[10.5px] transition ${
                flipV
                  ? "border-acid/40 bg-acid/10 text-acid"
                  : "border-line text-zinc-300 hover:border-line-2 hover:text-zinc-50"
              }`}
            >
              flip ↕
            </button>
          </div>
        </Field>

        <div className="mt-4">
          <Field
            label="Straighten"
            right={
              <span className="font-mono text-[10px] text-zinc-400">
                {straighten === 0 ? "0°" : `${straighten > 0 ? "+" : ""}${straighten.toFixed(1)}°`}
              </span>
            }
            hint="Nudge the horizon. Large angles add empty corners — crop them out."
          >
            <input
              type="range"
              min={-15}
              max={15}
              step={0.5}
              value={straighten}
              onChange={(event) => setStraighten(Number(event.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Aspect">
            <div className="flex flex-wrap gap-1">
              {ASPECTS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => applyAspect(entry.id)}
                  className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                    aspect === entry.id
                      ? "border-acid/40 bg-acid/10 text-acid"
                      : "border-line text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-ink px-2.5 py-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Output</p>
          <p className="mt-1 font-mono text-[12px] text-zinc-200">
            {outW} × {outH}
            <span className="ml-1.5 text-[10px] text-zinc-500">px</span>
          </p>
        </div>

        <div className="mt-4">
          <Field label="Format" hint={info.note}>
            <Segmented
              options={FORMATS.filter((entry) => supported[entry.value] !== false).map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
              value={format}
              onChange={(value) => setFormat(value as OutFormat)}
            />
          </Field>
        </div>

        {info.lossy && (
          <div className="mt-3">
            <Field
              label="Quality"
              right={<span className="font-mono text-[10px] text-zinc-400">{quality}</span>}
            >
              <input
                type="range"
                min={20}
                max={100}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="w-full"
              />
            </Field>
          </div>
        )}

        <Button className="mt-4 w-full" onClick={download}>
          <IconDownload size={14} /> Download crop
        </Button>

        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => applyAspect("free")}
            className="flex-1 rounded-lg border border-line px-2 py-1.5 font-mono text-[10px] text-zinc-500 transition hover:text-zinc-200"
          >
            reset crop
          </button>
          <button
            type="button"
            onClick={() => {
              setPicture(null);
              setCrop({ ...FULL });
              setNote(null);
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-2 py-1.5 font-mono text-[10px] text-zinc-500 transition hover:text-zinc-200"
          >
            <IconClose size={10} /> change
          </button>
        </div>

        {note && <p className="mt-2 text-[11px] leading-snug text-zinc-500">{note}</p>}
      </Panel>

      <div className="order-1 min-w-0 space-y-4 md:order-2">
        <div className="rounded-xl border border-line bg-checker p-3">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="mx-auto block max-h-[520px] w-auto max-w-full touch-none rounded-md cursor-crosshair"
            aria-label="Crop preview"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] text-zinc-600">
            {picture.name} · drag the box, pull a corner to resize
          </p>
          <label className="cursor-pointer font-mono text-[10px] text-zinc-500 transition hover:text-acid">
            + another image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void onFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
