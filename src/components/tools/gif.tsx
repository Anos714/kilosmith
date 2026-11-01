/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import {
  Button,
  DropZone,
  Field,
  IconButton,
  MiniButton,
  Panel,
  Segmented,
  Slider,
  Spinner,
  StatusTag,
} from "@/components/ui";
import { IconArrow, IconClose, IconDownload } from "@/components/icons";
import { decodeImage, canvasOf } from "@/lib/image";
import { formatBytes } from "@/lib/format";
import { saveBlob } from "@/lib/zip";

type Frame = { id: string; file: File; name: string; url: string };
type Output = { url: string; size: number };

const MIN_DELAY = 30;
const MAX_DELAY = 600;

/** The controls hand back strings; never let a NaN reach the canvas or the encoder. */
function toNumber(value: string | number, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export default function GifTool() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [delay, setDelay] = useState(120);
  const [width, setWidth] = useState("480");
  const [colors, setColors] = useState("256");
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runId = useRef(0);
  const outputRef = useRef<Output | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  // Every preview is an object URL, so drop them when the tool goes away.
  useEffect(
    () => () => {
      for (const frame of framesRef.current) URL.revokeObjectURL(frame.url);
      if (outputRef.current) URL.revokeObjectURL(outputRef.current.url);
    },
    []
  );

  /** The only place the GIF URL is written, so the old one is always revoked first. */
  function commitOutput(next: Output | null) {
    if (outputRef.current) URL.revokeObjectURL(outputRef.current.url);
    outputRef.current = next;
    setResult(next);
  }

  async function build(list: Frame[]) {
    if (!list.length) return;

    // A build takes seconds. Whoever started last owns the screen; stale runs bail.
    runId.current += 1;
    const run = runId.current;
    const fresh = () => run === runId.current;

    setBuilding(true);
    setError(null);
    setDone(0);

    try {
      const maxWidth = toNumber(width, 480, 16, 1200);
      const limit = toNumber(colors, 256, 2, 256);
      const frameDelay = toNumber(delay, 120, MIN_DELAY, MAX_DELAY);
      const gif = GIFEncoder();

      let targetW = 0;
      let targetH = 0;

      for (let index = 0; index < list.length; index++) {
        const frame = list[index];
        const bitmap = await decodeImage(frame.file);
        try {
          if (!targetW) {
            const scale = Math.min(1, maxWidth / bitmap.width);
            targetW = Math.max(2, Math.round(bitmap.width * scale));
            targetH = Math.max(2, Math.round(bitmap.height * scale));
          }

          const canvas = canvasOf(targetW, targetH);
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, targetW, targetH);
          const scale = Math.max(targetW / bitmap.width, targetH / bitmap.height);
          const dw = bitmap.width * scale;
          const dh = bitmap.height * scale;
          ctx.drawImage(bitmap, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);

          if (!fresh()) return;

          const { data } = ctx.getImageData(0, 0, targetW, targetH);
          const palette = quantize(data, limit);
          const indexed = applyPalette(data, palette);
          gif.writeFrame(indexed, targetW, targetH, {
            palette,
            delay: frameDelay,
            repeat: 0,
            first: index === 0,
          });

          setDone(index + 1);
        } finally {
          // Also runs when a frame throws, so no decoded bitmap is left behind.
          bitmap.close?.();
        }
      }

      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      if (!fresh()) {
        URL.revokeObjectURL(url);
        return;
      }
      commitOutput({ url, size: blob.size });
    } catch (err) {
      if (fresh()) setError(err instanceof Error ? err.message : "Could not build the GIF");
    } finally {
      if (fresh()) setBuilding(false);
    }
  }

  useEffect(() => {
    if (!frames.length) return;
    const timer = window.setTimeout(() => void build(frames), 260);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, delay, width, colors]);

  function add(files: File[]) {
    const next = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    if (!next.length) return;
    setFrames((previous) => [...previous, ...next]);
  }

  function remove(id: string) {
    const frame = frames.find((entry) => entry.id === id);
    if (frame) URL.revokeObjectURL(frame.url);

    const next = frames.filter((entry) => entry.id !== id);
    setFrames(next);

    if (!next.length) {
      // Retire any build in flight, then clear the GIF it may still be holding.
      runId.current += 1;
      commitOutput(null);
      setDone(0);
    }
  }

  function move(id: string, direction: -1 | 1) {
    setFrames((previous) => {
      const index = previous.findIndex((entry) => entry.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  async function download() {
    if (!result) return;
    try {
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("The GIF could not be read back");
      saveBlob(await response.blob(), "kilosmith.gif");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The download failed");
    }
  }

  const total = frames.length;
  const pct = result && !building ? 100 : total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="w-full">
      {total === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          accent="bg-bubble"
          doodle="make it wobble"
          title="Drop the stills for your GIF"
          hint="Two or more images, in the order you want them to play. Decoding happens in this tab — nothing is uploaded."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
              The recipe
            </p>

            <div className="mt-3">
              <Slider
                label="Frame delay"
                min={MIN_DELAY}
                max={MAX_DELAY}
                step={10}
                value={delay}
                display={`${delay}ms`}
                onChange={setDelay}
              />
            </div>

            <div className="mt-4">
              <Field label="Width" hint="Height follows the first frame's aspect ratio.">
                <Segmented
                  options={[
                    { value: "320", label: "320" },
                    { value: "480", label: "480" },
                    { value: "640", label: "640" },
                    { value: "900", label: "900" },
                  ]}
                  value={width}
                  onChange={setWidth}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Palette" hint="Fewer colors = smaller file and a chunkier look.">
                <Segmented
                  options={[
                    { value: "64", label: "64" },
                    { value: "128", label: "128" },
                    { value: "256", label: "256" },
                  ]}
                  value={colors}
                  onChange={setColors}
                />
              </Field>
            </div>

            <div className="mt-5 hairline pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-[family-name:var(--font-display)] text-[12.5px] text-ink-2 tabular-nums">
                  {building ? `frame ${done}/${total}` : result ? "all squished" : "warming up"}
                </p>
                {error ? (
                  <StatusTag state="error" text="failed" />
                ) : building ? (
                  <StatusTag state="working" />
                ) : result ? (
                  <StatusTag state="done" text={formatBytes(result.size)} />
                ) : null}
              </div>

              <div className="meter mt-2.5">
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>

              <Button className="mt-3 w-full" onClick={download} disabled={!result || building}>
                <IconDownload size={14} /> Download GIF
              </Button>
              {error && <p className="mt-2 text-[12.5px] leading-snug text-error">{error}</p>}
            </div>
          </Panel>

          <div className="order-1 min-w-0 space-y-3 md:order-2">
            <div className="tile">
              <div className="bg-checker flex min-h-[280px] items-center justify-center p-3">
                {result ? (
                  <img
                    key={result.url}
                    src={result.url}
                    alt="GIF preview"
                    className="max-h-[320px] w-auto object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10">
                    {building && <Spinner />}
                    <p className="text-[12.5px] text-muted">
                      {building ? "hold on, it is drawing every frame" : "no GIF yet"}
                    </p>
                  </div>
                )}
              </div>
              <div className="tile-foot">
                <span>
                  {width}px · {colors} colors · {delay}ms per frame
                </span>
                <span className="tabular-nums">{result ? formatBytes(result.size) : "…"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
              <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <span className="text-ink tabular-nums">{total}</span> stills ·{" "}
                <span className="tabular-nums">{((total * delay) / 1000).toFixed(1)}s</span> per loop
              </p>
              <MiniButton onClick={() => addInputRef.current?.click()}>+ add stills</MiniButton>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {frames.map((frame, index) => (
                <div key={frame.id} className="tile wiggle" title={frame.name}>
                  <div className="bg-checker relative" style={{ height: 78 }}>
                    <img src={frame.url} alt="" className="h-full w-full object-cover" />
                    <span className="tag absolute left-1 top-1 bg-bubble tabular-nums">
                      {index + 1}
                    </span>
                    <IconButton
                      onClick={() => remove(frame.id)}
                      label={`Remove ${frame.name}`}
                      className="absolute right-1 top-1 size-6 bg-coral"
                    >
                      <IconClose size={9} />
                    </IconButton>
                  </div>
                  <div className="tile-foot justify-center">
                    <IconButton
                      onClick={() => move(frame.id, -1)}
                      label={`Move ${frame.name} earlier`}
                      disabled={index === 0}
                      className="size-6"
                    >
                      <IconArrow size={10} className="rotate-180" />
                    </IconButton>
                    <IconButton
                      onClick={() => move(frame.id, 1)}
                      label={`Move ${frame.name} later`}
                      disabled={index === total - 1}
                      className="size-6"
                    >
                      <IconArrow size={10} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <input
        ref={addInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}
