"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Button,
  Chip,
  DropZone,
  Field,
  IconButton,
  MiniButton,
  Panel,
  Segmented,
  Slider,
  StatusTag,
} from "@/components/ui";
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
type Feedback = { kind: "done" | "error"; text: string };

const PREVIEW_EDGE = 1600;
const EXPORT_EDGE = 6000;
const MIN_CROP = 0.04;
const STRAIGHTEN_MAX = 15;

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

/** Slider values are always numeric, but a stray NaN must not freeze a control. */
function finiteNumber(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

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
 * maths to a single drawImage, with no transform bookkeeping at export time.
 * Returns null when the browser refuses a 2D context — better an error on
 * screen than a silently blank canvas.
 */
function rotatedCanvas(
  bitmap: ImageBitmap,
  quarter: number,
  straighten: number,
  flipH: boolean,
  flipV: boolean,
  maxEdge: number
): HTMLCanvasElement | null {
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
  if (!ctx) return null;

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
  ctx.fillStyle = "rgba(34,17,57,0.62)";
  ctx.fillRect(0, 0, w, y);
  ctx.fillRect(0, y + ch, w, h - y - ch);
  ctx.fillRect(0, y, x, ch);
  ctx.fillRect(x + cw, y, w - x - cw, ch);

  const k = Math.max(1, w / 700);

  ctx.strokeStyle = "rgba(123,224,184,0.95)";
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
  ctx.strokeStyle = "#7be0b8";
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  /** A browser-level problem that outlives any one file or export. */
  const [browserNote, setBrowserNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rotatedRef = useRef<HTMLCanvasElement | null>(null);
  const cropRef = useRef<Crop>(crop);
  /** The live bitmap, in a ref so replaces and unmount always see the newest one. */
  const pictureRef = useRef<Picture | null>(null);
  const dragRef = useRef<{ mode: "move" | "corner"; corner: number; dx: number; dy: number } | null>(
    null
  );

  const info = formatInfo(format);

  /** Swap the live picture and always release the full-size bitmap it replaces. */
  function swapPicture(next: Picture | null) {
    const previous = pictureRef.current;
    if (previous && previous !== next) previous.bitmap.close();
    pictureRef.current = next;
    setPicture(next);
  }

  // This tool stays mounted for the whole session, so a left-behind bitmap
  // would sit in memory until the tab closes.
  useEffect(
    () => () => {
      pictureRef.current?.bitmap.close();
      pictureRef.current = null;
    },
    []
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // If a 2D context is not available nothing can be drawn or exported,
        // so say it up front instead of leaving a blank canvas behind.
        if (!canvasOf(2, 2).getContext("2d")) {
          if (alive) {
            setBrowserNote("This browser would not hand over a canvas, so there is nothing to crop with.");
          }
          return;
        }
        const entries = await Promise.all(
          FORMATS.map(async (entry) => [entry.value, await supportsFormat(entry.value)] as const)
        );
        if (alive) setSupported(Object.fromEntries(entries));
      } catch {
        if (alive) {
          setBrowserNote(
            "This browser would not say which formats it can encode, so the list may look braver than it is."
          );
        }
      }
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
    // No context means nothing to paint; the banner from the mount check says so.
    if (!rotated) return;
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

  function adopt(pic: Picture) {
    const dims = sourceDims(pic);
    swapPicture(pic);
    setQuarter(0);
    setStraighten(0);
    setFlipH(false);
    setFlipV(false);
    setAspect("free");
    setCrop(cropForAspect("free", dims.width, dims.height));
    setFeedback(null);
  }

  function startOver() {
    swapPicture(null);
    rotatedRef.current = null;
    dragRef.current = null;
    setCrop({ ...FULL });
    setFeedback(null);
  }

  async function onFiles(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith("image/"));
    if (!file) {
      setFeedback({ kind: "error", text: "That is not a picture this browser can read." });
      return;
    }

    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await decodeImage(file);
      if (!bitmap.width || !bitmap.height) {
        throw new Error("That file decoded to an empty picture.");
      }
      adopt({ bitmap, name: file.name.replace(/\.[a-z0-9]+$/i, "") });
    } catch (error) {
      // On this path the bitmap never reaches state, so release it here.
      bitmap?.close();
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "That file could not be decoded as an image. A JPG or PNG usually behaves better.",
      });
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
    if (!picture || busy) return;
    setBusy(true);
    try {
      const full = rotatedCanvas(
        picture.bitmap,
        quarter,
        straighten,
        flipH,
        flipV,
        EXPORT_EDGE
      );
      if (!full) throw new Error("This browser would not hand over a canvas to export from.");

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

      const blob = await toBlob(out, format, finiteNumber(quality / 100, 0.05, 1, 0.9));
      saveBlob(blob, `${slug(picture.name)}-crop.${extensionFor(blob, format)}`);
      setFeedback({
        kind: "done",
        text: `Saved ${out.width}×${out.height} ${info.label} · ${formatBytes(blob.size)}.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not export this crop.",
      });
    } finally {
      setBusy(false);
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

  /** Same clamp as the pointer "move" branch, in 1% steps (5% with Shift). */
  function onKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;

    event.preventDefault();
    setCrop((current) => ({
      ...current,
      x: Math.min(1 - current.w, Math.max(0, current.x + dx)),
      y: Math.min(1 - current.h, Math.max(0, current.y + dy)),
    }));
  }

  /* ---------------------------------- view ---------------------------------- */

  if (!picture) {
    return (
      <div className="space-y-3">
        <DropZone
          onFiles={(files) => {
            void onFiles(files);
          }}
          accent="bg-mint"
          doodle="chop chop"
          title="Drop an image to crop, rotate and straighten"
          hint="Drag the box or its corners. Nothing is uploaded — it all happens in this tab."
        />
        {browserNote && <FeedbackLine item={{ kind: "error", text: browserNote }} />}
        {feedback && <FeedbackLine item={feedback} />}
      </div>
    );
  }

  const source = sourceDims(picture);
  const exportScale = Math.min(1, EXPORT_EDGE / Math.max(source.width, source.height));
  const outW = Math.max(1, Math.round(crop.w * source.width * exportScale));
  const outH = Math.max(1, Math.round(crop.h * source.height * exportScale));
  const kept = Math.round(crop.w * crop.h * 100);

  return (
    <div className="grid gap-4 md:grid-cols-[272px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <Field label="Rotate & flip">
          <div className="grid grid-cols-2 gap-1.5">
            <MiniButton onClick={() => turn(-1)} title="Rotate 90° counter-clockwise">
              90° left
            </MiniButton>
            <MiniButton onClick={() => turn(1)} title="Rotate 90° clockwise">
              90° right
            </MiniButton>
            <MiniButton onClick={() => flip("h")} active={flipH} title="Mirror left to right">
              flip ↔
            </MiniButton>
            <MiniButton onClick={() => flip("v")} active={flipV} title="Mirror top to bottom">
              flip ↕
            </MiniButton>
          </div>
        </Field>

        <div className="mt-4">
          <Slider
            label="Straighten"
            min={-STRAIGHTEN_MAX}
            max={STRAIGHTEN_MAX}
            step={0.5}
            value={straighten}
            display={
              straighten === 0
                ? "0°"
                : `${straighten > 0 ? "+" : ""}${straighten.toFixed(1)}°`
            }
            onChange={(value) =>
              setStraighten(finiteNumber(value, -STRAIGHTEN_MAX, STRAIGHTEN_MAX, 0))
            }
          />
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
              Nudge the horizon. Big angles add empty corners — crop them out.
            </p>
            <MiniButton
              onClick={() => setStraighten(0)}
              disabled={straighten === 0}
              title="Back to level"
            >
              level it
            </MiniButton>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Aspect">
            <div className="flex flex-wrap gap-1.5">
              {ASPECTS.map((entry) => (
                <Chip
                  key={entry.id}
                  active={aspect === entry.id}
                  onClick={() => applyAspect(entry.id)}
                  title={`Crop to ${entry.label}`}
                >
                  {entry.label}
                </Chip>
              ))}
            </div>
          </Field>
        </div>

        <div className="hairline mt-5 pt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="font-[family-name:var(--font-display)] text-[12px] font-medium uppercase tracking-[0.1em] text-mint-deep">
                Export size
              </p>
              <p className="mt-1 text-[12px] text-muted tabular-nums">
                {info.label} · long edge capped at {EXPORT_EDGE}px
              </p>
            </div>
            <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink tabular-nums">
              {outW} × {outH}
              <span className="ml-1 text-[12px] font-medium text-muted">px</span>
            </p>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div
              className="meter min-w-0 flex-1"
              role="progressbar"
              aria-label="Share of the frame kept"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={kept}
            >
              <div
                className="meter-fill"
                style={{
                  width: `${kept}%`,
                  background:
                    "repeating-linear-gradient(-55deg, var(--color-mint) 0 6px, var(--color-aqua) 6px 12px)",
                }}
              />
            </div>
            <p className="font-[family-name:var(--font-display)] text-[12px] font-medium text-ink-2 tabular-nums">
              {kept}% kept
            </p>
          </div>
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
            <Slider
              label="Quality"
              min={20}
              max={100}
              value={quality}
              display={`${quality}`}
              onChange={(value) => setQuality(finiteNumber(value, 20, 100, 90))}
            />
          </div>
        )}

        <Button className="mt-4 w-full" onClick={download} disabled={busy}>
          <IconDownload size={14} />
          {busy ? "slicing…" : "Download crop"}
        </Button>

        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <MiniButton onClick={() => applyAspect("free")} title="Stretch the box back to the frame">
            reset box
          </MiniButton>
          <MiniButton
            onClick={() => {
              setQuarter(0);
              setStraighten(0);
              setFlipH(false);
              setFlipV(false);
              applyAspect(aspect, picture, 0, 0);
            }}
            title="Undo every rotation, flip and straighten"
          >
            un-tilt
          </MiniButton>
        </div>

        <p className="mt-2 text-center text-[12px] text-muted">
          No files were harmed, or uploaded.
        </p>

        {(browserNote || feedback) && (
          <div className="mt-3 space-y-2">
            {browserNote && <FeedbackLine item={{ kind: "error", text: browserNote }} />}
            {feedback && <FeedbackLine item={feedback} />}
          </div>
        )}
      </Panel>

      <div className="order-1 min-w-0 space-y-2 md:order-2">
        <div className="pop-sm overflow-hidden bg-card">
          <div className="bg-checker p-2 sm:p-3">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              tabIndex={0}
              aria-label="Crop preview. Drag the box to move it, pull a corner to resize it, or focus it and use the arrow keys to nudge it."
              className="mx-auto block max-h-[520px] w-auto max-w-full touch-none cursor-crosshair rounded-[10px]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-ink bg-paper-2 px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-[13.5px] font-medium text-ink">
                {picture.name}
              </p>
              <p className="text-[12px] text-muted">
                drag the box · pull a corner · arrows nudge, Shift for big steps
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <MiniButton onClick={() => inputRef.current?.click()}>+ add another</MiniButton>
              <IconButton onClick={startOver} label="Start over with a blank canvas">
                <IconClose size={12} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        aria-label="Add a photo to crop"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}

function FeedbackLine({ item }: { item: Feedback }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-ink bg-card px-3 py-2">
      <StatusTag state={item.kind} text={item.kind === "error" ? "oops" : "done!"} />
      <p
        className={`min-w-0 flex-1 text-[12.5px] leading-snug ${
          item.kind === "error" ? "text-error" : "text-ink-2"
        }`}
      >
        {item.text}
      </p>
    </div>
  );
}
