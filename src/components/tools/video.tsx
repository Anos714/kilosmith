"use client";

import { useEffect, useState } from "react";
import { Button, DropZone, Field, Panel, Segmented, Spinner } from "@/components/ui";
import { IconDownload, IconVideo } from "@/components/icons";
import { formatBytes } from "@/lib/format";
import { slug } from "@/lib/format";
import { saveBlob } from "@/lib/zip";
import {
  canEncodeAac,
  canUseWebCodecs,
  compressVideo,
  probeVideo,
  type VideoProbe,
} from "@/lib/video";

type Result = { url: string; blob: Blob; width: number; height: number; note?: string };

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

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  async function onFiles(files: File[]) {
    const picked = files.find((entry) => entry.type.startsWith("video/"));
    if (!picked) return;
    setError(null);
    setResult((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
    setFile(picked);
    setProbe(null);
    try {
      const meta = await probeVideo(picked);
      setProbe(meta);
      setStart(0);
      setEnd(meta.duration);
      setAudioOk(await canEncodeAac());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this video");
    }
  }

  async function run() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: 0, phase: "starting" });
    try {
      const out = await compressVideo(
        file,
        {
          quality,
          maxHeight: Number(maxHeight),
          keepAudio: keepAudio && audioOk !== false,
          start,
          end,
        },
        (update) =>
          setProgress({ done: update.done, total: update.total, phase: update.phase })
      );
      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url: URL.createObjectURL(out.blob), blob: out.blob, width: out.width, height: out.height, note: out.note };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compression failed");
    } finally {
      setRunning(false);
    }
  }

  if (!file) {
    return (
      <div>
        <DropZone
          onFiles={onFiles}
          accept="video/*"
          title="Drop a video to shrink it"
          hint="MP4 or MOV with H.264 — the clip never leaves your device, it is re-encoded by your own GPU."
        />
        {!supported && (
          <p className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] text-amber-300/80">
            This browser has no WebCodecs, so video compression is unavailable. Chrome, Edge or
            Safari 16.4+ will work.
          </p>
        )}
      </div>
    );
  }

  const clipLength = probe ? Math.max(0.1, (end || probe.duration) - start) : 0;
  const trimmed = !!probe && (start > 0.05 || end < probe.duration - 0.05);
  const estimate = probe
    ? (() => {
        const height = Number(maxHeight) || probe.height;
        const scale = Math.min(1, height / probe.height);
        const w = probe.width * scale;
        const h = probe.height * scale;
        const bpp = 0.018 + (quality / 100) * 0.09;
        const bitrate = w * h * 30 * bpp;
        return ((bitrate + (keepAudio ? 128_000 : 0)) * clipLength) / 8;
      })()
    : 0;

  const savings = result ? Math.round((1 - result.blob.size / file.size) * 100) : 0;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Source</p>
        <p className="mt-1 truncate text-[12px] text-zinc-300">{file.name}</p>
        <p className="font-mono text-[10px] text-zinc-600">
          {probe ? `${probe.width}×${probe.height} · ${probe.duration.toFixed(1)}s · ` : ""}
          {formatBytes(file.size)}
        </p>

        <div className="mt-4">
          <Field
            label="Trim"
            right={
              <span className="font-mono text-[10px] text-zinc-400">
                {clipLength.toFixed(1)}s
              </span>
            }
            hint={trimmed ? "Only this range is encoded." : "Drag to keep just part of the clip."}
          >
            <div className="space-y-1.5">
              <label className="flex items-center gap-2">
                <span className="w-6 font-mono text-[9.5px] uppercase text-zinc-600">in</span>
                <input
                  type="range"
                  min={0}
                  max={probe?.duration ?? 0}
                  step={0.1}
                  value={start}
                  disabled={running || !probe}
                  onChange={(event) =>
                    setStart(Math.min(Number(event.target.value), Math.max(0, end - 0.2)))
                  }
                  className="w-full"
                  aria-label="Trim start"
                />
                <span className="w-9 text-right font-mono text-[9.5px] text-zinc-500">
                  {start.toFixed(1)}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-6 font-mono text-[9.5px] uppercase text-zinc-600">out</span>
                <input
                  type="range"
                  min={0}
                  max={probe?.duration ?? 0}
                  step={0.1}
                  value={end || probe?.duration || 0}
                  disabled={running || !probe}
                  onChange={(event) =>
                    setEnd(Math.max(Number(event.target.value), start + 0.2))
                  }
                  className="w-full"
                  aria-label="Trim end"
                />
                <span className="w-9 text-right font-mono text-[9.5px] text-zinc-500">
                  {(end || probe?.duration || 0).toFixed(1)}
                </span>
              </label>
            </div>
          </Field>
          {trimmed && (
            <button
              type="button"
              onClick={() => {
                setStart(0);
                setEnd(probe?.duration ?? 0);
              }}
              className="mt-2 font-mono text-[10px] text-zinc-500 transition hover:text-zinc-200"
            >
              use the full clip
            </button>
          )}
        </div>

        <div className="mt-4">
          <Field
            label="Quality"
            right={<span className="font-mono text-[10px] text-zinc-400">{quality}</span>}
            hint="Maps to a bitrate budget, not a re-encode of each frame by hand."
          >
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="w-full"
              disabled={running}
            />
          </Field>
        </div>

        <div className="mt-4">
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

        <label
          className={`mt-4 flex items-center justify-between rounded-lg border border-line px-2.5 py-2 ${
            audioOk === false ? "opacity-50" : "cursor-pointer"
          }`}
        >
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Keep audio
          </span>
          <input
            type="checkbox"
            checked={keepAudio && audioOk !== false}
            disabled={audioOk === false}
            onChange={(event) => setKeepAudio(event.target.checked)}
            className="size-3.5 accent-acid"
          />
        </label>

        {audioOk === false && (
          <p className="mt-2 text-[11px] leading-snug text-amber-300/80">
            This browser cannot encode AAC here, so the clip is exported without sound. The video
            still compresses; only the audio track is skipped.
          </p>
        )}

        <p className="mt-3 font-mono text-[10px] text-zinc-600">
          estimate ≈ {formatBytes(estimate)}
        </p>

        <Button className="mt-3 w-full" onClick={run} disabled={running || !probe}>
          {running ? <Spinner /> : <IconVideo size={14} />}
          {running ? " Encoding…" : " Compress"}
        </Button>

        {running && (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-acid transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-zinc-600">
              {progress.phase} · {progress.done}/{progress.total || "?"}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setFile(null);
            setProbe(null);
            setResult((previous) => {
              if (previous) URL.revokeObjectURL(previous.url);
              return null;
            });
          }}
          className="mt-3 w-full text-center font-mono text-[10px] text-zinc-600 transition hover:text-zinc-300"
        >
          choose another file
        </button>
      </Panel>

      <div className="order-1 min-w-0 space-y-3 md:order-2">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {result ? (
            <video src={result.url} controls className="max-h-[420px] w-full bg-black" />
          ) : (
            <div className="flex h-[220px] items-center justify-center bg-checker">
              <p className="font-mono text-[11px] text-zinc-600">
                {running ? "encoding in your browser…" : "drop a clip to begin"}
              </p>
            </div>
          )}
        </div>

        {result && (
          <div className="rounded-xl border border-line bg-panel p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                  Result
                </p>
                <p className="text-[15px] text-zinc-100">
                  {formatBytes(result.blob.size)}{" "}
                  <span className={savings > 0 ? "text-acid" : "text-amber-400"}>
                    {savings > 0 ? `−${savings}%` : `+${Math.abs(savings)}%`}
                  </span>
                </p>
                <p className="font-mono text-[10px] text-zinc-600">
                  {result.width}×{result.height} · from {formatBytes(file.size)}
                </p>
              </div>
              <Button
                onClick={() => saveBlob(result.blob, `${slug(file.name)}-sizekit.mp4`)}
              >
                <IconDownload size={14} /> Download MP4
              </Button>
            </div>
            {(result.note || audioOk === false) && (
              <p className="mt-2 text-[11px] text-zinc-500">
                {audioOk === false
                  ? "This browser has no AAC encoder, so the exported clip has no audio track."
                  : result.note}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-[11.5px] text-red-300">
            {error}
          </p>
        )}

        <p className="font-mono text-[10px] leading-relaxed text-zinc-600">
          Encoded with WebCodecs on your machine. Long clips take a while — nothing is uploaded
          and you can keep working in another tab.
        </p>
      </div>
    </div>
  );
}
