/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
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
  decodeImage,
  drawCover,
  encodeToTarget,
  extensionFor,
  formatInfo,
  supportsFormat,
  toBlob,
  type OutFormat,
} from "@/lib/image";
import { formatBytes, slug } from "@/lib/format";
import { makeZip, saveBlob, zipName } from "@/lib/zip";

type Row = {
  id: string;
  file: File;
  name: string;
  thumb: string;
  original: number;
  status: "working" | "done" | "error";
  error?: string;
  note?: string;
  out?: { blob: Blob; url: string; size: number; type: string };
};

type FormatChoice = "auto" | OutFormat;

type Config = {
  quality: number;
  format: FormatChoice;
  maxEdge: number;
  targetBytes: number;
};

function guessFormat(file: File): OutFormat {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/avif") return "avif";
  return "jpeg";
}

/** Decode, scale and encode one row. The bitmap always closes, even if the encode throws. */
async function encodeRow(row: Row, config: Config) {
  const bitmap = await decodeImage(row.file);
  try {
    const target = config.format === "auto" ? guessFormat(row.file) : config.format;
    const canvas = drawCover(
      bitmap,
      config.maxEdge || undefined,
      target === "jpeg" || target === "avif" ? "#ffffff" : undefined
    );
    if (config.targetBytes) {
      const encoded = await encodeToTarget(canvas, target, config.targetBytes);
      return { blob: encoded.blob, met: encoded.met, target };
    }
    const blob = await toBlob(canvas, target, config.quality);
    return { blob, met: true, target };
  } finally {
    bitmap.close?.();
  }
}

export default function CompressTool() {
  const [rows, setRows] = useState<Row[]>([]);
  const [quality, setQuality] = useState(78);
  const [format, setFormat] = useState<FormatChoice>("auto");
  const [maxEdge, setMaxEdge] = useState("0");
  const [targetKB, setTargetKB] = useState("");
  const [supported, setSupported] = useState<Record<string, boolean>>({});
  const [zipping, setZipping] = useState(false);

  const rowsRef = useRef<Row[]>([]);
  const timer = useRef<number | null>(null);
  const runRef = useRef<() => Promise<void>>(async () => {});
  const runId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = (next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
  };

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

  function schedule() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runRef.current(), 220);
  }

  async function run() {
    const my = ++runId.current;
    const config: Config = {
      quality: quality / 100,
      format,
      maxEdge: Number(maxEdge),
      targetBytes: Math.max(0, Number(targetKB) || 0) * 1024,
    };

    for (const row of [...rowsRef.current]) {
      // A newer run (slider moved, format flipped) owns the queue now — stop here.
      if (my !== runId.current) return;
      commit(
        rowsRef.current.map((entry) =>
          entry.id === row.id
            ? { ...entry, status: "working", error: undefined, note: undefined }
            : entry
        )
      );
      try {
        const { blob, met, target } = await encodeRow(row, config);
        const url = URL.createObjectURL(blob);

        if (my !== runId.current) {
          URL.revokeObjectURL(url);
          return;
        }
        const current = rowsRef.current.find((entry) => entry.id === row.id);
        if (!current) {
          // Cleared or removed mid-run — nothing left here would ever revoke this URL.
          URL.revokeObjectURL(url);
          continue;
        }
        if (current.out) URL.revokeObjectURL(current.out.url);

        const note =
          config.targetBytes > 0 && !met
            ? `could not get under ${Math.round(config.targetBytes / 1024)} KB — this is the smallest it gets`
            : undefined;

        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "done",
                  note,
                  out: {
                    blob,
                    url,
                    size: blob.size,
                    type: blob.type || formatInfo(target).mime,
                  },
                }
              : entry
          )
        );
      } catch (error) {
        if (my !== runId.current) return;
        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "error",
                  note: undefined,
                  error: error instanceof Error ? error.message : "Could not process this image",
                }
              : entry
          )
        );
      }
    }
  }

  // Always schedule the newest render's run, so a format or quality change is
  // not lost to the closure captured when the debounce timer was created.
  runRef.current = run;

  function add(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const added: Row[] = images.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      thumb: URL.createObjectURL(file),
      original: file.size,
      status: "working",
    }));
    commit([...rowsRef.current, ...added]);
    schedule();
  }

  function remove(id: string) {
    const row = rowsRef.current.find((entry) => entry.id === id);
    if (row) {
      URL.revokeObjectURL(row.thumb);
      if (row.out) URL.revokeObjectURL(row.out.url);
    }
    commit(rowsRef.current.filter((entry) => entry.id !== id));
  }

  function clear() {
    runId.current++;
    for (const row of rowsRef.current) {
      URL.revokeObjectURL(row.thumb);
      if (row.out) URL.revokeObjectURL(row.out.url);
    }
    commit([]);
  }

  async function downloadAll() {
    const list = rowsRef.current.filter((row) => row.out);
    if (!list.length) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const row of list) {
        const blob = row.out!.blob;
        files[zipName(used, `${slug(row.name)}.${extensionFor(blob)}`)] = new Uint8Array(
          await blob.arrayBuffer()
        );
      }
      saveBlob(await makeZip(files), "kilosmith-compressed.zip");
    } finally {
      setZipping(false);
    }
  }

  const totalIn = rows.reduce((sum, row) => sum + row.original, 0);
  const totalOut = rows.reduce((sum, row) => sum + (row.out?.size ?? 0), 0);
  const delta = totalIn - totalOut;
  const saved = totalIn && totalOut ? Math.round((delta / totalIn) * 100) : 0;

  return (
    <div>
      {rows.length === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          accent="bg-coral"
          doodle="make it skinny"
          title="Drop images to compress"
          hint="JPG, PNG, WebP or AVIF. Batch it; nothing is uploaded, everything happens in this tab."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <div className="space-y-4">
              <div>
                <Slider
                  label="Quality"
                  min={10}
                  max={100}
                  value={quality}
                  display={`${quality}`}
                  onChange={(value) => {
                    setQuality(value);
                    schedule();
                  }}
                />
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  {format === "png"
                    ? "PNG is lossless, so quality does not apply. Pick WebP or AVIF to actually save bytes."
                    : "Lower is smaller. 75–85 is usually invisible on photos."}
                </p>
              </div>

              <Field label="Format" hint="Auto keeps what you dropped in.">
                <Segmented
                  options={[
                    { value: "auto", label: "Auto" },
                    ...FORMATS.filter((entry) => supported[entry.value] !== false).map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    })),
                  ]}
                  value={format}
                  onChange={(value) => {
                    setFormat(value as FormatChoice);
                    schedule();
                  }}
                />
              </Field>

              <Field label="Max edge" hint="Downscaling saves more than quality ever will.">
                <Segmented
                  options={[
                    { value: "0", label: "Original" },
                    { value: "1920", label: "1920" },
                    { value: "1280", label: "1280" },
                    { value: "800", label: "800" },
                  ]}
                  value={maxEdge}
                  onChange={(value) => {
                    setMaxEdge(value);
                    schedule();
                  }}
                />
              </Field>

              <Field label="Target size" hint="Optional. Encoder quality is binary-searched to fit.">
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="off"
                    aria-label="Target size in KB"
                    value={targetKB}
                    onChange={(event) => {
                      setTargetKB(event.target.value.replace(/[^0-9]/g, ""));
                      schedule();
                    }}
                    className="field-input"
                  />
                  <span className="font-[family-name:var(--font-display)] text-[12px] text-muted">
                    KB
                  </span>
                </div>
              </Field>

              <div className="flex items-center justify-between gap-2 hairline pt-4">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-[12px] text-muted">
                    {delta >= 0 ? "Saved" : "Larger"}
                  </p>
                  <p
                    className={`font-[family-name:var(--font-display)] text-[15px] font-semibold tabular-nums ${
                      delta >= 0 ? "text-accent-deep" : "text-ink-2"
                    }`}
                  >
                    {totalOut ? `${Math.abs(saved)}%` : "0%"}{" "}
                    <span className="text-[12px] font-normal text-muted">
                      {totalOut ? formatBytes(Math.abs(delta)) : ""}
                    </span>
                  </p>
                </div>
                <Button variant="ghost" onClick={clear}>
                  Clear
                </Button>
              </div>

              <Button className="w-full" onClick={downloadAll} disabled={!totalOut || zipping}>
                <IconDownload size={14} />
                {zipping ? "Packing…" : `Download all · ${formatBytes(totalOut)}`}
              </Button>
            </div>
          </Panel>

          <div className="order-1 min-w-0 space-y-3 md:order-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
              <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2 tabular-nums">
                {rows.length} image{rows.length > 1 ? "s" : ""} · {formatBytes(totalIn)} →{" "}
                <span className="text-ink">{formatBytes(totalOut)}</span>
              </p>
              <MiniButton onClick={() => inputRef.current?.click()}>+ add</MiniButton>
            </div>

            <input
              ref={inputRef}
              type="file"
              aria-label="Add photos to compress"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                add(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />

            {rows.map((row) => {
              const ratio = row.out ? 1 - row.out.size / row.original : 0;
              const grew = ratio < 0;
              return (
                <div
                  key={row.id}
                  className="pop-sm flex flex-wrap items-center gap-3 bg-card px-3 py-2.5"
                >
                  <div className="thumb size-11 shrink-0">
                    <img src={row.thumb} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-[11rem] flex-1">
                    <p className="truncate font-[family-name:var(--font-display)] text-[14px] font-medium text-ink">
                      {row.name}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="meter min-w-0 flex-1">
                        <div
                          className="meter-fill"
                          style={{
                            width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                            background: "var(--color-coral)",
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-[12px] text-muted tabular-nums">
                        {row.out
                          ? `${formatBytes(row.original)} → ${formatBytes(row.out.size)}`
                          : formatBytes(row.original)}
                      </span>
                    </div>
                    {(row.error || row.note) && (
                      <p className="mt-1.5 text-[12px] text-error">{row.error ?? row.note}</p>
                    )}
                  </div>
                  <StatusTag
                    state={row.status}
                    text={
                      row.status === "working"
                        ? "squishing…"
                        : row.status === "error"
                          ? "failed"
                          : undefined
                    }
                  />
                  {row.out && (
                    <span
                      className={`tag shrink-0 ${grew ? "bg-butter" : "bg-mint"}`}
                      title={grew ? "This encode is larger than the source" : "Smaller than the source"}
                    >
                      {grew ? "+" : "−"}
                      {Math.abs(Math.round(ratio * 100))}%
                    </span>
                  )}
                  <IconButton
                    label={`Download ${row.name}`}
                    disabled={!row.out}
                    onClick={() =>
                      row.out &&
                      saveBlob(
                        row.out.blob,
                        `${slug(row.name)}.${extensionFor(row.out.blob)}`
                      )
                    }
                  >
                    <IconDownload size={12} />
                  </IconButton>
                  <IconButton label={`Remove ${row.name}`} onClick={() => remove(row.id)}>
                    <IconClose size={12} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
