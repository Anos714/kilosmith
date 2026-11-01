"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  DropZone,
  Field,
  MiniButton,
  Panel,
  Segmented,
  Slider,
  Spinner,
  StatusTag,
} from "@/components/ui";
import { IconArrow, IconDownload, IconVideo } from "@/components/icons";
import { formatBytes, slug } from "@/lib/format";
import { saveBlob } from "@/lib/zip";
import {
  canEncodeAac,
  canUseWebCodecs,
  compressVideo,
  probeVideo,
  type VideoProbe,
} from "@/lib/video";

type Result = { url: string; blob: Blob; width: number; height: number; note?: string };

/** A number we can safely put into Math.min/max, a slider or a size calculation.
 *  Anything NaN/Infinity (a cleared field, a metadata probe that never resolved)
 *  falls back to the low end instead of poisoning the maths. */
function clampNum(value: number, lo: number, hi: number): number {
  const low = Number.isFinite(lo) ? Math.max(lo, 0) : 0;
  const high = Number.isFinite(hi) ? Math.max(hi, low) : low;
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(value, low), high);
}

/** Media metadata is a guess until the browser says otherwise: an unseekable MP4 or
 *  WebM reports `duration: Infinity` or `NaN`, and dimensions can arrive as 0. */
function readDuration(probe: VideoProbe | null): number | null {
  if (!probe) return null;
  return Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null;
}

function readSize(probe: VideoProbe | null): { width: number; height: number } | null {
  if (!probe) return null;
  if (!Number.isFinite(probe.width) || probe.width <= 0) return null;
  if (!Number.isFinite(probe.height) || probe.height <= 0) return null;
  return { width: probe.width, height: probe.height };
}

/** Keep the in/out pair inside the clip and at least two tenths apart, so the
 *  trim can never collapse into an inverted or zero-length range. */
function trimmedPair(rawIn: number, rawOut: number, duration: number) {
  const first = clampNum(rawIn, 0, duration);
  const second = clampNum(rawOut, 0, duration);
  const inAt = Math.min(first, Math.max(0, second - 0.2));
  const outAt = Math.max(second, Math.min(duration, inAt + 0.2));
  return { in: inAt, out: outAt };
}

export default function VideoTool() {
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [quality, setQuality] = useState(62);
  const [maxHeight, setMaxHeight] = useState("1080");
  const [keepAudio, setKeepAudio] = useState(true);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(canUseWebCodecs);
  const [audioOk, setAudioOk] = useState<boolean | null>(null);

  /** Bumped whenever a new clip takes over, so an encode still running for the
   *  previous clip can never commit its result, its progress or its object URL. */
  const runId = useRef(0);
  const resultRef = useRef<Result | null>(null);

  useEffect(
    () => () => {
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = null;
    },
    []
  );

  function publishResult(next: Result | null) {
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    resultRef.current = next;
    setResult(next);
  }

  async function onFiles(files: File[]) {
    const picked = files.find((entry) => entry.type.startsWith("video/"));
    if (!picked) return;

    // Drop whatever encode is still in flight: its commits are guarded by runId.
    runId.current += 1;
    setRunning(false);
    setError(null);
    setProgress({ done: 0, total: 0, phase: "" });
    publishResult(null);
    setFile(picked);
    setProbe(null);
    setStart(0);
    setEnd(0);
    try {
      const meta = await probeVideo(picked);
      setProbe(meta);
      setStart(0);
      setEnd(readDuration(meta) ?? 0);
      setAudioOk(await canEncodeAac());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this video");
    }
  }

  async function run() {
    if (!file || running) return;
    const gen = ++runId.current;
    const clipLen = readDuration(probe);
    const range = clipLen === null ? null : trimmedPair(start, end || clipLen, clipLen);
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: 0, phase: "starting" });
    try {
      const out = await compressVideo(
        file,
        {
          quality: clampNum(quality, 10, 100),
          maxHeight: clampNum(Number(maxHeight), 0, 8192),
          keepAudio: keepAudio && audioOk !== false,
          // Without a trustworthy length we simply keep the whole clip.
          start: range ? range.in : 0,
          end: range ? range.out : undefined,
        },
        (update) => {
          if (gen !== runId.current) return;
          setProgress({ done: update.done, total: update.total, phase: update.phase });
        }
      );
      if (gen !== runId.current) {
        // A newer clip took over while this was encoding. No URL was made for this
        // blob, so the result is simply dropped and the garbage collector wins.
        return;
      }
      const url = URL.createObjectURL(out.blob);
      publishResult({
        url,
        blob: out.blob,
        width: out.width,
        height: out.height,
        note: out.note,
      });
    } catch (err) {
      if (gen === runId.current) {
        setError(err instanceof Error ? err.message : "Compression failed");
      }
    } finally {
      if (gen === runId.current) setRunning(false);
    }
  }

  if (!file) {
    return (
      <div>
        <DropZone
          onFiles={(files) => {
            void onFiles(files).catch((err) =>
              setError(err instanceof Error ? err.message : "Could not read this video")
            );
          }}
          accept="video/*"
          accent="bg-lilac"
          doodle="squeeze the moving bits"
          title="Drop a video to squish it"
          hint="MP4 or MOV with H.264. The clip never leaves your device; it is re-encoded by your own GPU."
        />
        {!supported && (
          <p className="mt-3 rounded-2xl border-2 border-ink bg-coral px-3 py-2 text-[12.5px] leading-snug text-ink">
            This browser has no WebCodecs, so video compression is unavailable. Chrome, Edge or
            Safari 16.4+ will work.
          </p>
        )}
      </div>
    );
  }

  const duration = readDuration(probe);
  const size = readSize(probe);
  const trimOn = duration !== null;
  const range = duration === null ? null : trimmedPair(start, end || duration, duration);
  const inAt = range ? range.in : 0;
  const outAt = range ? range.out : 0;
  const clipLength = range ? Math.max(0.1, outAt - inAt) : null;
  const trimmed = !!range && duration !== null && (inAt > 0.05 || outAt < duration - 0.05);

  const targetHeight = clampNum(Number(maxHeight), 0, 8192);
  const estimate = (() => {
    if (!size || clipLength === null) return null;
    const height = targetHeight > 0 ? targetHeight : size.height;
    const scale = Math.min(1, height / size.height);
    const w = size.width * scale;
    const h = size.height * scale;
    const bpp = 0.018 + (clampNum(quality, 10, 100) / 100) * 0.09;
    const bitrate = w * h * 30 * bpp;
    return ((bitrate + (keepAudio && audioOk !== false ? 128_000 : 0)) * clipLength) / 8;
  })();

  const savings = result && file.size > 0 ? Math.round((1 - result.blob.size / file.size) * 100) : 0;
  const percent =
    progress.total > 0 && Number.isFinite(progress.done)
      ? Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)))
      : 0;

  return (
    <div className="grid gap-4 md:grid-cols-[272px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
          Source
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink">{file.name}</p>
        <p className="text-[12.5px] tabular-nums text-muted">
          {size ? `${size.width}×${size.height}` : "size unreadable"}
          {" · "}
          {duration === null ? "length unclear" : `${duration.toFixed(1)}s`}
          {" · "}
          {formatBytes(file.size)}
        </p>

        {!supported && (
          <p className="mt-2 rounded-2xl border-2 border-ink bg-coral px-2.5 py-1.5 text-[12px] leading-snug text-ink">
            No WebCodecs here, so encoding will fail. Chrome, Edge or Safari 16.4+ works.
          </p>
        )}

        <div className="mt-4">
          <Field
            label="Trim"
            right={
              <span className="font-[family-name:var(--font-display)] text-[12.5px] tabular-nums text-ink-2">
                {clipLength === null ? "no length" : `${clipLength.toFixed(1)}s of clip`}
              </span>
            }
            hint={
              trimOn
                ? trimmed
                  ? "Only this range is encoded."
                  : "Drag to keep just part of the clip."
                : "This clip will not report its length, so trim is off. Squishing the whole thing still works."
            }
          >
            <fieldset disabled={!trimOn || running} className="contents">
              <div className="space-y-3">
                <Slider
                  label="Trim start"
                  min={0}
                  max={duration ?? 0}
                  step={0.1}
                  value={inAt}
                  display={`${inAt.toFixed(1)}s in`}
                  onChange={(value) => setStart(clampNum(value, 0, duration ?? 0))}
                />
                <Slider
                  label="Trim end"
                  min={0}
                  max={duration ?? 0}
                  step={0.1}
                  value={outAt}
                  display={`${outAt.toFixed(1)}s out`}
                  onChange={(value) => setEnd(clampNum(value, 0, duration ?? 0))}
                />
              </div>
            </fieldset>
            {trimmed && (
              <MiniButton
                className="mt-2.5"
                onClick={() => {
                  setStart(0);
                  setEnd(duration ?? 0);
                }}
              >
                use the full clip
              </MiniButton>
            )}
          </Field>
        </div>

        <div className="mt-4 hairline pt-4">
          <fieldset disabled={running} className="contents">
            <Slider
              label="Quality"
              min={10}
              max={100}
              value={quality}
              display={`${quality}`}
              onChange={(value) => setQuality(clampNum(value, 10, 100))}
            />
          </fieldset>
          <div className="mt-2 flex justify-between font-[family-name:var(--font-display)] text-[12px] text-muted">
            <span>smaller file</span>
            <span>sharper</span>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-muted">
            Maps to a bitrate budget, not a re-encode of each frame by hand.
          </p>
        </div>

        <div className="mt-4 hairline pt-4">
          <Field label="Resolution">
            <Segmented
              options={[
                { value: "0", label: "Source" },
                { value: "1080", label: "1080p" },
                { value: "720", label: "720p" },
                { value: "480", label: "480p" },
              ]}
              value={maxHeight}
              onChange={setMaxHeight}
            />
          </Field>
        </div>

        <div className="mt-4 hairline pt-4">
          <label
            className={`flex items-center justify-between gap-2 rounded-2xl border-2 border-ink px-3 py-2 transition-colors ${
              audioOk === false
                ? "bg-card opacity-60"
                : "cursor-pointer bg-card hover:bg-lilac/50"
            }`}
          >
            <span className="font-[family-name:var(--font-display)] text-[13px] font-medium text-ink">
              Keep audio
            </span>
            <input
              type="checkbox"
              aria-label="Keep audio"
              checked={keepAudio && audioOk !== false}
              disabled={audioOk === false || running}
              onChange={(event) => setKeepAudio(event.target.checked)}
              className="size-4 accent-[var(--color-lilac)]"
            />
          </label>
          {audioOk === false ? (
            <p className="mt-2 text-[12px] leading-snug text-error">
              This browser cannot encode AAC here, so the clip is exported without sound. The video
              still compresses; only the audio track is skipped.
            </p>
          ) : (
            <p className="mt-2 text-[12px] leading-snug text-muted">
              Needs an AAC encoder in the browser. Without one the clip comes out silent.
            </p>
          )}
        </div>

        <p className="mt-4 text-[12.5px] tabular-nums text-muted">
          {estimate === null ? (
            <>
              No size guess —{" "}
              <span className="text-ink-2">this clip keeps its length (or its size) secret.</span>
            </>
          ) : (
            <>
              Should land near{" "}
              <span className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
                {formatBytes(estimate)}
              </span>
            </>
          )}
        </p>

        <Button className="mt-3 w-full" onClick={run} disabled={running || !probe}>
          {running ? <Spinner /> : <IconVideo size={14} />}
          {running ? "Encoding…" : "Squish it"}
        </Button>

        {running && (
          <div className="mt-3">
            <div
              className="meter"
              role="progressbar"
              aria-label="Encoding progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="meter-fill"
                style={{
                  width: `${percent}%`,
                  background:
                    "repeating-linear-gradient(-55deg, var(--color-lilac) 0 6px, var(--color-bubble) 6px 12px)",
                }}
              />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
              <span className="tabular-nums">
                {progress.phase} · {progress.done}/{progress.total || "?"}
                {progress.phase === "video" ? " frames" : ""}
              </span>
              <span className="flex items-center gap-2">
                <StatusTag state="working" />
                <span className="font-[family-name:var(--font-display)] tabular-nums text-ink-2">
                  {percent}%
                </span>
              </span>
            </p>
          </div>
        )}

        <div className="mt-3 flex justify-end gap-1.5">
          <MiniButton
            onClick={() => {
              runId.current += 1;
              setRunning(false);
              setFile(null);
              setProbe(null);
              setError(null);
              setProgress({ done: 0, total: 0, phase: "" });
              publishResult(null);
            }}
          >
            pick another clip
          </MiniButton>
        </div>
      </Panel>

      <div className="order-1 min-w-0 space-y-3 md:order-2">
        <div className="tile bg-checker">
          {result ? (
            <video
              src={result.url}
              controls
              className="max-h-[420px] w-full bg-card object-contain"
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <span
                  className={`sticker rotate-2 bg-lilac text-[12px] ${running ? "animate-pulse" : ""}`}
                >
                  {running ? "encoding…" : "squeeze me"}
                </span>
                <p className="text-[12px] text-muted">
                  {running
                    ? "Frames are leaving your GPU one at a time."
                    : "The finished clip shows up here."}
                </p>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="pane p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
                    was
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-[20px] font-semibold leading-tight tabular-nums text-ink-2">
                    {formatBytes(file.size)}
                  </p>
                </div>
                <IconArrow size={18} className="mb-2 text-muted" />
                <div>
                  <p className="font-[family-name:var(--font-display)] text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
                    now
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-[24px] font-semibold leading-tight tabular-nums text-ink">
                    {formatBytes(result.blob.size)}
                  </p>
                </div>
                <span
                  className={`sticker -rotate-2 ${savings > 0 ? "bg-mint" : "bg-coral"} mb-1`}
                >
                  {savings > 0 ? `−${savings}% off` : `+${Math.abs(savings)}% fatter`}
                </span>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <StatusTag state="done" />
                <Button onClick={() => saveBlob(result.blob, `${slug(file.name)}-kilosmith.mp4`)}>
                  <IconDownload size={14} /> Download MP4
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[12.5px] tabular-nums text-muted">
              {result.width}×{result.height} · from {formatBytes(file.size)} · nothing uploaded
            </p>
            {(result.note || audioOk === false) && (
              <p className="mt-2 text-[12px] leading-snug text-ink-2">
                {audioOk === false
                  ? "This browser has no AAC encoder, so the exported clip has no audio track."
                  : result.note}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-ink bg-coral px-3 py-2">
            <StatusTag state="error" text="failed" />
            <p className="text-[13px] text-ink">{error}</p>
          </div>
        )}

        <p className="text-[12px] leading-relaxed text-muted">
          Encoded with WebCodecs on your machine. Long clips take a while. Nothing is uploaded and
          you can keep working in another tab.
        </p>
      </div>
    </div>
  );
}
