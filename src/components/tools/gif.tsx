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
import { IconArrow, IconClose, IconCopy, IconDownload } from "@/components/icons";
import { decodeImage, canvasOf, extensionFor } from "@/lib/image";
import { formatBytes, slug } from "@/lib/format";
import { makeZip, saveBlob, zipName } from "@/lib/zip";
import { GRAB_FRAME_CAP, grabVideoFrames, probeClip } from "@/lib/video-frames";

type Frame = { id: string; file: Blob; name: string; url: string; delay?: number };
type Output = { url: string; size: number };
type VideoJob = {
  file: File;
  name: string;
  duration: number;
  start: number;
  end: number;
  fps: string;
};

const MIN_DELAY = 30;
const MAX_DELAY = 600;
const MIN_FRAME_DELAY = 30;
const MAX_FRAME_DELAY = 2000;
const GRAB_FPS = ["6", "10", "12", "15", "20"];
const SPEEDS = ["0.25", "0.5", "1", "2", "4"];
const SPEED_LABELS: Record<string, string> = {
  "0.25": "¼×",
  "0.5": "½×",
  "1": "1×",
  "2": "2×",
  "4": "4×",
};

/** The controls hand back strings; never let a NaN reach the canvas or the encoder. */
function toNumber(value: string | number, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export default function GifTool() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [delay, setDelay] = useState(120);
  const [speed, setSpeed] = useState("1");
  const [loop, setLoop] = useState("0");
  const [fit, setFit] = useState("cover");
  const [width, setWidth] = useState("480");
  const [colors, setColors] = useState("256");
  const [selected, setSelected] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoJob | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [grabDone, setGrabDone] = useState(0);
  const [grabTotal, setGrabTotal] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runId = useRef(0);
  const grabId = useRef(0);
  const probeId = useRef(0);
  const outputRef = useRef<Output | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const addInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  /** What this frame plays for: its own delay (or the base), scaled by speed. */
  function effectiveDelay(frame: Frame) {
    const base = frame.delay ?? toNumber(delay, 120, MIN_DELAY, MAX_DELAY);
    const rate = Number(speed);
    const scale = Number.isFinite(rate) && rate > 0 ? rate : 1;
    // The GIF spec stores delays in 10ms ticks; browsers read <20ms as 100ms.
    return Math.min(10_000, Math.max(20, Math.round(base / scale)));
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
      const repeat = toNumber(loop, 0, -1, 100);
      const mode = fit === "contain" || fit === "stretch" ? fit : "cover";
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
          if (mode === "stretch") {
            ctx.drawImage(bitmap, 0, 0, targetW, targetH);
          } else {
            const scale =
              mode === "contain"
                ? Math.min(targetW / bitmap.width, targetH / bitmap.height)
                : Math.max(targetW / bitmap.width, targetH / bitmap.height);
            const dw = bitmap.width * scale;
            const dh = bitmap.height * scale;
            ctx.drawImage(bitmap, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
          }

          if (!fresh()) return;

          const { data } = ctx.getImageData(0, 0, targetW, targetH);
          const palette = quantize(data, limit);
          const indexed = applyPalette(data, palette);
          gif.writeFrame(indexed, targetW, targetH, {
            palette,
            delay: effectiveDelay(frame),
            repeat,
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
  }, [frames, delay, speed, loop, fit, width, colors]);

  function add(files: File[]) {
    const images: File[] = [];
    for (const file of files) {
      if (file.type.startsWith("video/")) void openVideo(file);
      else if (file.type.startsWith("image/")) images.push(file);
    }
    if (!images.length) return;
    const next = images.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setFrames((previous) => [...previous, ...next]);
  }

  /** Swap in a fresh clip and retire any grab or probe still in flight. */
  async function openVideo(file: File) {
    probeId.current += 1;
    grabId.current += 1;
    setGrabbing(false);
    setError(null);
    const run = probeId.current;
    try {
      const clip = await probeClip(file);
      if (run !== probeId.current) return;
      setVideo({
        file,
        name: file.name,
        duration: clip.duration,
        start: 0,
        end: Math.max(0.1, Math.min(clip.duration, 10)),
        fps: "12",
      });
    } catch (err) {
      if (run === probeId.current) {
        setError(err instanceof Error ? err.message : "That video could not be opened");
      }
    }
  }

  function closeVideo() {
    probeId.current += 1;
    grabId.current += 1;
    setGrabbing(false);
    setVideo(null);
  }

  async function grab() {
    const job = video;
    if (!job || grabbing) return;

    const fps = toNumber(job.fps, 12, 1, 60);
    const wanted = Math.min(
      GRAB_FRAME_CAP,
      Math.max(1, Math.ceil((job.end - job.start) * fps))
    );

    grabId.current += 1;
    const run = grabId.current;
    const fresh = () => run === grabId.current;

    setGrabbing(true);
    setGrabDone(0);
    setGrabTotal(wanted);
    setError(null);

    try {
      const pulled = await grabVideoFrames(job.file, {
        start: job.start,
        end: job.end,
        fps,
        onProgress: (step, all) => {
          if (fresh()) {
            setGrabDone(step);
            setGrabTotal(all);
          }
        },
        cancelled: () => grabId.current !== run,
      });
      if (!fresh() || !pulled.length) return;

      const base = slug(job.name);
      const added: Frame[] = pulled.map((frame, index) => {
        const name = `${base}-${String(index + 1).padStart(3, "0")}.jpg`;
        return {
          id: crypto.randomUUID(),
          file: frame.blob,
          name,
          url: URL.createObjectURL(frame.blob),
        };
      });
      setFrames((previous) => [...previous, ...added]);
      setVideo(null);
    } catch (err) {
      if (fresh()) {
        setError(err instanceof Error ? err.message : "Could not read frames from that video");
      }
    } finally {
      if (fresh()) setGrabbing(false);
    }
  }

  function remove(id: string) {
    const frame = frames.find((entry) => entry.id === id);
    if (frame) URL.revokeObjectURL(frame.url);

    const next = frames.filter((entry) => entry.id !== id);
    setFrames(next);
    if (selected === id) setSelected(null);

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

  function duplicate(id: string) {
    setFrames((previous) => {
      const index = previous.findIndex((entry) => entry.id === id);
      if (index < 0) return previous;
      const source = previous[index];
      // A fresh URL: the copy plays on its own, so revoking either is safe.
      const copy: Frame = {
        ...source,
        id: crypto.randomUUID(),
        url: URL.createObjectURL(source.file),
      };
      const next = [...previous];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function reverse() {
    setFrames((previous) => [...previous].reverse());
  }

  function setFrameDelay(id: string, value?: number) {
    setFrames((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, delay: value } : entry))
    );
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

  /** Every original still, in play order, as a ZIP. */
  async function downloadFrames() {
    if (!frames.length || zipping) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        const dot = frame.name.lastIndexOf(".");
        const ext = dot > 0 ? frame.name.slice(dot) : `.${extensionFor(frame.file)}`;
        files[zipName(used, `frame-${String(index + 1).padStart(3, "0")}${ext}`)] =
          new Uint8Array(await frame.file.arrayBuffer());
      }
      saveBlob(await makeZip(files), "kilosmith-frames.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The ZIP could not be built");
    } finally {
      setZipping(false);
    }
  }

  const total = frames.length;
  const pct = result && !building ? 100 : total ? Math.round((done / total) * 100) : 0;
  const loopMs = frames.reduce((sum, frame) => sum + effectiveDelay(frame), 0);
  const selectedIndex = selected ? frames.findIndex((entry) => entry.id === selected) : -1;
  const selectedFrame = selectedIndex >= 0 ? frames[selectedIndex] : null;
  const grabWanted = video
    ? Math.min(
        GRAB_FRAME_CAP,
        Math.max(1, Math.ceil((video.end - video.start) * toNumber(video.fps, 12, 1, 60)))
      )
    : 0;

  const videoCard = video ? (
    <div className="tile p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-ink">
          {video.name}
        </p>
        <IconButton
          onClick={closeVideo}
          label="Discard this video"
          className="size-6 shrink-0 bg-coral"
          disabled={grabbing}
        >
          <IconClose size={9} />
        </IconButton>
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <Slider
          label="From"
          min={0}
          max={Math.max(0.1, video.duration)}
          step={0.1}
          value={video.start}
          display={`${video.start.toFixed(1)}s`}
          onChange={(value) =>
            setVideo((previous) =>
              previous ? { ...previous, start: Math.min(value, previous.end - 0.1) } : previous
            )
          }
        />
        <Slider
          label="To"
          min={0}
          max={Math.max(0.1, video.duration)}
          step={0.1}
          value={video.end}
          display={`${video.end.toFixed(1)}s`}
          onChange={(value) =>
            setVideo((previous) =>
              previous ? { ...previous, end: Math.max(value, previous.start + 0.1) } : previous
            )
          }
        />
      </div>

      <div className="mt-3">
        <Field
          label="Frame rate"
          hint={`${grabWanted} frames will be pulled — the cap is ${GRAB_FRAME_CAP}.`}
        >
          <Segmented
            options={GRAB_FPS.map((value) => ({ value, label: value }))}
            value={video.fps}
            onChange={(value) =>
              setVideo((previous) => (previous ? { ...previous, fps: value } : previous))
            }
          />
        </Field>
      </div>

      <Button className="mt-3 w-full" onClick={grab} disabled={grabbing}>
        {grabbing ? (
          <>
            <Spinner /> grabbing {grabDone}/{grabTotal}
          </>
        ) : (
          <>Grab {grabWanted} frames</>
        )}
      </Button>
      {grabbing && (
        <div className="meter mt-2">
          <div
            className="meter-fill"
            style={{ width: `${grabTotal ? Math.round((grabDone / grabTotal) * 100) : 0}%` }}
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="w-full">
      {total === 0 ? (
        <div className="space-y-4">
          {videoCard}
          <DropZone
            onFiles={add}
            multiple
            accept="image/*,video/*"
            accent="bg-bubble"
            doodle="make it wobble"
            title="Drop stills — or a whole video"
            hint="Two or more images in play order, or a video and the tool pulls its frames out. Decoding happens in this tab — nothing is uploaded."
          />
          {error && <p className="text-[13px] leading-snug text-error">{error}</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
              The recipe
            </p>

            <div className="mt-3">
              <Slider
                label="Base delay"
                min={MIN_DELAY}
                max={MAX_DELAY}
                step={10}
                value={delay}
                display={`${delay}ms`}
                onChange={setDelay}
              />
            </div>

            <div className="mt-4">
              <Field label="Speed" hint="Scales every delay — 2× plays the GIF twice as fast.">
                <Segmented
                  options={SPEEDS.map((value) => ({ value, label: SPEED_LABELS[value] }))}
                  value={speed}
                  onChange={setSpeed}
                />
              </Field>
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

            <div className="mt-4">
              <Field
                label="Fit"
                hint="Fill crops to the box, Fit letterboxes on black, Stretch ignores the ratio."
              >
                <Segmented
                  options={[
                    { value: "cover", label: "Fill" },
                    { value: "contain", label: "Fit" },
                    { value: "stretch", label: "Stretch" },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Loop" hint="Forever, three times over, or play once and stop.">
                <Segmented
                  options={[
                    { value: "0", label: "Forever" },
                    { value: "3", label: "3×" },
                    { value: "-1", label: "Once" },
                  ]}
                  value={loop}
                  onChange={setLoop}
                />
              </Field>
            </div>

            {selectedFrame && (
              <div className="mt-4 hairline pt-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                    Frame {selectedIndex + 1} timing
                  </p>
                  <MiniButton
                    title="Give this frame back the base delay"
                    disabled={selectedFrame.delay === undefined}
                    onClick={() => setFrameDelay(selectedFrame.id)}
                  >
                    use base
                  </MiniButton>
                </div>
                <Slider
                  label="Delay"
                  min={MIN_FRAME_DELAY}
                  max={MAX_FRAME_DELAY}
                  step={10}
                  value={selectedFrame.delay ?? delay}
                  display={`${selectedFrame.delay ?? delay}ms`}
                  onChange={(value) => setFrameDelay(selectedFrame.id, value)}
                />
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  This frame only — the rest follow the base delay. Speed still scales everything.
                </p>
              </div>
            )}

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
            {videoCard}

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
                  {width}px · {colors} colors · {(loopMs / 1000).toFixed(1)}s loop
                </span>
                <span className="tabular-nums">{result ? formatBytes(result.size) : "…"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
              <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <span className="text-ink tabular-nums">{total}</span> stills ·{" "}
                <span className="tabular-nums">{(loopMs / 1000).toFixed(1)}s</span> per loop
              </p>
              <div className="flex flex-wrap gap-1.5">
                <MiniButton
                  onClick={reverse}
                  disabled={total < 2}
                  title="Play the frames backwards"
                >
                  reverse
                </MiniButton>
                <MiniButton
                  onClick={() => videoInputRef.current?.click()}
                  title="Pull frames out of a video"
                >
                  + video
                </MiniButton>
                <MiniButton
                  onClick={downloadFrames}
                  disabled={zipping}
                  title="Download every original still as a ZIP"
                >
                  {zipping ? "zipping…" : "frames → zip"}
                </MiniButton>
                <MiniButton onClick={() => addInputRef.current?.click()}>+ add stills</MiniButton>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {frames.map((frame, index) => (
                <div key={frame.id} className="tile wiggle" title={frame.name}>
                  <div
                    className="bg-checker relative cursor-pointer"
                    style={{ height: 78 }}
                    onClick={(event) => {
                      // Selecting on click, but the badge and remove button
                      // inside keep their own jobs.
                      if ((event.target as HTMLElement).closest("button")) return;
                      setSelected((current) => (current === frame.id ? null : frame.id));
                    }}
                  >
                    <img src={frame.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((current) => (current === frame.id ? null : frame.id))
                      }
                      aria-pressed={selected === frame.id}
                      aria-label={`Set the delay for frame ${index + 1}`}
                      title="Set this frame's delay"
                      className={`tag absolute left-1 top-1 cursor-pointer tabular-nums ${
                        selected === frame.id ? "bg-ink text-paper" : "bg-bubble"
                      }`}
                    >
                      {index + 1}
                    </button>
                    <IconButton
                      onClick={() => remove(frame.id)}
                      label={`Remove ${frame.name}`}
                      className="absolute right-1 top-1 size-6 bg-coral"
                    >
                      <IconClose size={9} />
                    </IconButton>
                    {frame.delay !== undefined && (
                      <span className="tag absolute bottom-1 right-1 bg-butter tabular-nums">
                        {effectiveDelay(frame)}ms
                      </span>
                    )}
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
                      onClick={() => duplicate(frame.id)}
                      label={`Duplicate ${frame.name}`}
                      className="size-6"
                    >
                      <IconCopy size={10} />
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
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = Array.from(event.target.files ?? [])[0];
          if (file) void openVideo(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
