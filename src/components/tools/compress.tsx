"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DropZone, Field, Panel, Segmented } from "@/components/ui";
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
import { makeZip, saveBlob } from "@/lib/zip";

type Row = {
  id: string;
  file: File;
  name: string;
  thumb: string;
  original: number;
  status: "working" | "done" | "error";
  error?: string;
  out?: { blob: Blob; url: string; size: number; type: string };
};

type FormatChoice = "auto" | OutFormat;

function guessFormat(file: File): OutFormat {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/avif") return "avif";
  return "jpeg";
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
    timer.current = window.setTimeout(() => void run(), 220);
  }

  async function run() {
    const config = {
      quality: quality / 100,
      format,
      maxEdge: Number(maxEdge),
      targetBytes: Math.max(0, Number(targetKB) || 0) * 1024,
    };

    for (const row of [...rowsRef.current]) {
      commit(
        rowsRef.current.map((entry) =>
          entry.id === row.id ? { ...entry, status: "working", error: undefined } : entry
        )
      );
      try {
        const bitmap = await decodeImage(row.file);
        const target = config.format === "auto" ? guessFormat(row.file) : config.format;
        const canvas = drawCover(
          bitmap,
          config.maxEdge || undefined,
          target === "jpeg" || target === "avif" ? "#ffffff" : undefined
        );
        bitmap.close?.();

        const blob = config.targetBytes
          ? (await encodeToTarget(canvas, target, config.targetBytes)).blob
          : await toBlob(canvas, target, config.quality);

        if (row.out) URL.revokeObjectURL(row.out.url);

        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "done",
                  out: {
                    blob,
                    url: URL.createObjectURL(blob),
                    size: blob.size,
                    type: blob.type || formatInfo(target).mime,
                  },
                }
              : entry
          )
        );
      } catch (error) {
        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "error",
                  error: error instanceof Error ? error.message : "Could not process this image",
                }
              : entry
          )
        );
      }
    }
  }

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
      for (const row of list) {
        const blob = row.out!.blob;
        files[`${slug(row.name)}.${extensionFor(blob)}`] = new Uint8Array(
          await blob.arrayBuffer()
        );
      }
      saveBlob(await makeZip(files), "sizekit-compressed.zip");
    } finally {
      setZipping(false);
    }
  }

  const totalIn = rows.reduce((sum, row) => sum + row.original, 0);
  const totalOut = rows.reduce((sum, row) => sum + (row.out?.size ?? 0), 0);
  const saved = totalIn && totalOut ? Math.round((1 - totalOut / totalIn) * 100) : 0;

  return (
    <div>
      {rows.length === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          title="Drop images to compress"
          hint="JPG · PNG · WebP · AVIF — batch it, nothing is uploaded."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <Field
              label="Quality"
              right={<span className="font-mono text-[10px] text-zinc-400">{quality}</span>}
              hint="Lower is smaller. 75–85 is usually invisible on photos."
            >
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(event) => {
                  setQuality(Number(event.target.value));
                  schedule();
                }}
                className="w-full"
              />
            </Field>

            <div className="mt-4">
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
            </div>

            <div className="mt-4">
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
            </div>

            <div className="mt-4">
              <Field label="Target size" hint="Optional. Encoder quality is binary-searched to fit.">
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="off"
                    value={targetKB}
                    onChange={(event) => {
                      setTargetKB(event.target.value.replace(/[^0-9]/g, ""));
                      schedule();
                    }}
                    className="w-full rounded-lg border border-line bg-ink px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-line-2"
                  />
                  <span className="font-mono text-[10px] text-zinc-600">KB</span>
                </div>
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Saved</p>
                <p className="text-[13px] text-acid">
                  {saved > 0 ? `${saved}%` : "—"}{" "}
                  <span className="text-[11px] text-zinc-500">
                    {totalOut ? `${formatBytes(totalIn - totalOut)}` : ""}
                  </span>
                </p>
              </div>
              <Button variant="ghost" onClick={clear}>
                clear
              </Button>
            </div>

            <Button className="mt-3 w-full" onClick={downloadAll} disabled={!totalOut || zipping}>
              {zipping ? "Packing…" : `Download all · ${formatBytes(totalOut)}`}
            </Button>
          </Panel>

          <div className="order-1 min-w-0 space-y-2 md:order-2">
            <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2">
              <p className="font-mono text-[10.5px] text-zinc-500">
                {rows.length} image{rows.length > 1 ? "s" : ""} · {formatBytes(totalIn)} →{" "}
                <span className="text-zinc-300">{formatBytes(totalOut)}</span>
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

            {rows.map((row) => {
              const ratio = row.out ? 1 - row.out.size / row.original : 0;
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5"
                >
                  <div className="size-10 shrink-0 overflow-hidden rounded-md border border-line bg-checker">
                    <img src={row.thumb} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-zinc-300">{row.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-acid transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                        {row.status === "working"
                          ? "working…"
                          : row.error
                            ? "failed"
                            : `${formatBytes(row.original)} → ${formatBytes(row.out?.size ?? 0)}`}
                      </span>
                    </div>
                  </div>
                  {row.out && (
                    <span className="shrink-0 font-mono text-[10px] text-acid">
                      −{Math.round(ratio * 100)}%
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!row.out}
                    onClick={() => row.out && saveBlob(row.out.blob, `${slug(row.name)}.${extensionFor(row.out.blob)}`)}
                    className="rounded-md border border-line p-1.5 text-zinc-400 transition hover:border-line-2 hover:text-acid disabled:opacity-30"
                    aria-label={`Download ${row.name}`}
                  >
                    <IconDownload size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    className="rounded-md p-1.5 text-zinc-600 transition hover:text-zinc-300"
                    aria-label={`Remove ${row.name}`}
                  >
                    <IconClose size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
