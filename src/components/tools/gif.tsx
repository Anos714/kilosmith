"use client";

import { useEffect, useState } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { Button, DropZone, Field, Panel, Segmented, Spinner } from "@/components/ui";
import { IconClose, IconDownload } from "@/components/icons";
import { decodeImage, canvasOf } from "@/lib/image";
import { formatBytes } from "@/lib/format";
import { saveBlob } from "@/lib/zip";

type Frame = { id: string; file: File; name: string; url: string };

export default function GifTool() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [delay, setDelay] = useState(120);
  const [width, setWidth] = useState("480");
  const [colors, setColors] = useState("256");
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function build(frames: Frame[]) {
    if (!frames.length) return;
    setBuilding(true);
    setError(null);
    try {
      const maxWidth = Number(width);
      const limit = Number(colors);
      const gif = GIFEncoder();

      let targetW = 0;
      let targetH = 0;

      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        const bitmap = await decodeImage(frame.file);
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
        bitmap.close?.();

        const { data } = ctx.getImageData(0, 0, targetW, targetH);
        const palette = quantize(data, limit);
        const indexed = applyPalette(data, palette);
        gif.writeFrame(indexed, targetW, targetH, {
          palette,
          delay,
          repeat: 0,
          first: index === 0,
        });
      }

      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url: URL.createObjectURL(blob), size: blob.size };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the GIF");
    } finally {
      setBuilding(false);
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
    setFrames((previous) => [...previous, ...next]);
  }

  function remove(id: string) {
    setFrames((previous) => {
      const frame = previous.find((entry) => entry.id === id);
      if (frame) URL.revokeObjectURL(frame.url);
      const next = previous.filter((entry) => entry.id !== id);
      if (!next.length) {
        setResult((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return null;
        });
      }
      return next;
    });
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
    const response = await fetch(result.url);
    saveBlob(await response.blob(), "sizekit.gif");
  }

  return (
    <div>
      {frames.length === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          title="Drop stills for your GIF"
          hint="2+ images. Order matters — drag in the sequence you want it to play."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <Field
              label="Frame delay"
              right={<span className="font-mono text-[10px] text-zinc-400">{delay}ms</span>}
            >
              <input
                type="range"
                min={30}
                max={600}
                step={10}
                value={delay}
                onChange={(event) => setDelay(Number(event.target.value))}
                className="w-full"
              />
            </Field>

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

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                  {building ? "building…" : result ? formatBytes(result.size) : "—"}
                </p>
                {building && <Spinner />}
              </div>
              <Button className="mt-3 w-full" onClick={download} disabled={!result || building}>
                <IconDownload size={14} /> Download GIF
              </Button>
              {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
            </div>
          </Panel>

          <div className="order-1 min-w-0 space-y-3 md:order-2">
            <div className="flex gap-3">
              <div className="flex flex-1 items-center justify-center rounded-xl border border-line bg-checker p-3">
                {result ? (
                  <img
                    key={result.url}
                    src={result.url}
                    alt="GIF preview"
                    className="max-h-[320px] rounded-md object-contain"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center">
                    {building ? <Spinner /> : <p className="text-[12px] text-zinc-600">No frames</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2">
              <p className="font-mono text-[10.5px] text-zinc-500">
                {frames.length} frames · {(frames.length * delay) / 1000}s loop
              </p>
              <label className="cursor-pointer font-mono text-[10.5px] text-zinc-500 transition hover:text-acid">
                + add
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    add(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {frames.map((frame, index) => (
                <div key={frame.id} className="group relative overflow-hidden rounded-lg border border-line bg-panel">
                  <div className="bg-checker" style={{ height: 78 }}>
                    <img src={frame.url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <span className="absolute left-1 top-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-zinc-300">
                    {index + 1}
                  </span>
                  <div className="flex items-center justify-between border-t border-line px-1 py-0.5">
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => move(frame.id, -1)}
                        className="px-1 text-[10px] text-zinc-500 hover:text-acid"
                        aria-label="Move earlier"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => move(frame.id, 1)}
                        className="px-1 text-[10px] text-zinc-500 hover:text-acid"
                        aria-label="Move later"
                      >
                        →
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(frame.id)}
                      className="p-1 text-zinc-600 hover:text-red-400"
                      aria-label="Remove frame"
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
