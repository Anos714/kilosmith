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
  Spinner,
  StatusTag,
} from "@/components/ui";
import { IconClose, IconDownload } from "@/components/icons";
import {
  FORMATS,
  decodeImage,
  drawCover,
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
  size: number;
  status: "working" | "done" | "error";
  error?: string;
  out?: { blob: Blob; url: string; size: number };
};

export default function ConvertTool() {
  const [rows, setRows] = useState<Row[]>([]);
  const [format, setFormat] = useState<OutFormat>("webp");
  const [quality, setQuality] = useState(88);
  const [supported, setSupported] = useState<Record<string, boolean>>({});
  const [zipping, setZipping] = useState(false);
  const rowsRef = useRef<Row[]>([]);
  const settingsRef = useRef({ format, quality });
  const runId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
  };

  /** Keep the ref in step with the state so a run always reads the current settings. */
  function patchSettings(patch: Partial<{ format: OutFormat; quality: number }>) {
    settingsRef.current = { ...settingsRef.current, ...patch };
    if (patch.format !== undefined) setFormat(patch.format);
    if (patch.quality !== undefined) setQuality(patch.quality);
  }

  async function run() {
    // A newer run cancels this one; the settings snapshot stops a run started before a
    // format change from converting with the stale format via a closure.
    const my = ++runId.current;
    const { format: target, quality: targetQuality } = settingsRef.current;

    for (const row of [...rowsRef.current]) {
      if (my !== runId.current) return;
      commit(
        rowsRef.current.map((entry) =>
          entry.id === row.id ? { ...entry, status: "working" } : entry
        )
      );

      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await decodeImage(row.file);
        const canvas = drawCover(
          bitmap,
          undefined,
          target === "jpeg" || target === "avif" ? "#ffffff" : undefined
        );
        const blob = await toBlob(canvas, target, targetQuality / 100);
        if (my !== runId.current) return;
        const url = URL.createObjectURL(blob);
        const current = rowsRef.current.find((entry) => entry.id === row.id);
        if (!current) {
          // The row was removed mid-run; nothing would ever revoke this URL.
          URL.revokeObjectURL(url);
          continue;
        }
        if (current.out) URL.revokeObjectURL(current.out.url);
        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "done",
                  out: { blob, url, size: blob.size },
                }
              : entry
          )
        );
      } catch (error) {
        if (my !== runId.current) return;
        commit(
          rowsRef.current.map((entry) => {
            if (entry.id !== row.id) return entry;
            if (entry.out) URL.revokeObjectURL(entry.out.url);
            return {
              ...entry,
              status: "error",
              out: undefined,
              error: error instanceof Error ? error.message : "Could not convert this file",
            };
          })
        );
      } finally {
        bitmap?.close?.();
      }
    }
  }

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
    if (!rowsRef.current.length) return;
    const timer = window.setTimeout(() => void run(), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, quality]);

  // The tool can sit mounted for a whole session, so on unmount cancel any in-flight run
  // and hand back every object URL it still owns.
  useEffect(
    () => () => {
      runId.current += 1;
      for (const row of rowsRef.current) {
        URL.revokeObjectURL(row.thumb);
        if (row.out) URL.revokeObjectURL(row.out.url);
      }
    },
    []
  );

  function add(files: File[]) {
    const added: Row[] = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        thumb: URL.createObjectURL(file),
        size: file.size,
        status: "working",
      }));
    commit([...rowsRef.current, ...added]);
    void run();
  }

  function remove(id: string) {
    const row = rowsRef.current.find((entry) => entry.id === id);
    if (row) {
      URL.revokeObjectURL(row.thumb);
      if (row.out) URL.revokeObjectURL(row.out.url);
    }
    commit(rowsRef.current.filter((entry) => entry.id !== id));
  }

  async function downloadAll() {
    const list = rowsRef.current.filter((row) => row.out);
    if (!list.length || zipping) return;
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
      saveBlob(await makeZip(files), `kilosmith-${format}.zip`);
    } finally {
      setZipping(false);
    }
  }

  const totalOut = rows.reduce((sum, row) => sum + (row.out?.size ?? 0), 0);
  const info = formatInfo(format);
  const doneCount = rows.filter((row) => row.status === "done" && row.out).length;
  const progress = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  return (
    <div>
      {rows.length === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          accent="bg-sky"
          doodle="pick a new outfit"
          title="Drop images to convert"
          hint="PNG, JPEG, WebP and AVIF, in bulk. Alpha is kept where the format allows it. Nothing leaves this tab."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
          <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
            <Field label="Convert to" hint={info.note}>
              <Segmented
                options={FORMATS.filter((entry) => supported[entry.value] !== false).map(
                  (entry) => ({ value: entry.value, label: entry.label })
                )}
                value={format}
                onChange={(value) => patchSettings({ format: value as OutFormat })}
              />
            </Field>

            {info.lossy && (
              <div className="mt-4">
                <Slider
                  label="Quality"
                  min={20}
                  max={100}
                  value={quality}
                  onChange={(value) => patchSettings({ quality: value })}
                />
              </div>
            )}

            {!info.alpha && (
              <p className="mt-3 rounded-2xl border-2 border-ink bg-card px-2.5 py-2 text-[12.5px] leading-snug text-ink-2">
                {info.label} has no transparency: transparent pixels are composited on white.
              </p>
            )}

            <div className="mt-4 hairline pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                  {doneCount}/{rows.length} done
                </p>
                <p className="font-[family-name:var(--font-display)] text-[13px] text-ink tabular-nums">
                  {formatBytes(totalOut)}
                </p>
              </div>
              <div className="meter mt-2.5">
                <div className="h-full bg-sky" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <Button className="mt-3 w-full" onClick={downloadAll} disabled={!totalOut || zipping}>
              <IconDownload size={14} />
              {zipping ? "Packing…" : `Download all · ${formatBytes(totalOut)}`}
            </Button>
          </Panel>

          <div className="order-1 min-w-0 space-y-3 md:order-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
              <p className="font-[family-name:var(--font-display)] text-[13.5px] text-ink-2">
                {rows.length} file{rows.length > 1 ? "s" : ""} →{" "}
                <span className="text-ink">{info.label}</span>
              </p>
              <MiniButton onClick={() => inputRef.current?.click()}>+ add more</MiniButton>
            </div>

            <input
              ref={inputRef}
              type="file"
              aria-label="Add images to convert"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                add(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="tile">
                  <div className="bg-checker relative" style={{ height: 120 }}>
                    {row.out ? (
                      <img
                        src={row.out.url}
                        alt={row.name}
                        className="h-full w-full object-contain"
                      />
                    ) : row.status === "error" ? (
                      <p
                        title={row.error}
                        className="flex h-full items-center justify-center px-2 text-center text-[12px] leading-snug text-error"
                      >
                        {row.error ?? "failed"}
                      </p>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Spinner />
                      </div>
                    )}
                    <IconButton
                      onClick={() => remove(row.id)}
                      label={`Remove ${row.name}`}
                      className="absolute left-1.5 top-1.5"
                    >
                      <IconClose size={12} />
                    </IconButton>
                    {row.out && (
                      <button
                        type="button"
                        onClick={() =>
                          saveBlob(
                            row.out!.blob,
                            `${slug(row.name)}.${extensionFor(row.out!.blob)}`
                          )
                        }
                        aria-label={`Download ${row.name}`}
                        title={`Download ${row.name}`}
                        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full border-2 border-ink bg-sky text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-6 active:translate-y-0.5 active:shadow-none"
                      >
                        <IconDownload size={12} />
                      </button>
                    )}
                  </div>
                  <div className="tile-foot tile-foot-col">
                    <div className="flex w-full items-center justify-between gap-1.5">
                      <span className="min-w-0 truncate" title={row.name}>
                        {row.name}
                      </span>
                      <StatusTag state={row.status} />
                    </div>
                    <span className="w-full whitespace-nowrap text-[11.5px] text-muted tabular-nums">
                      {formatBytes(row.size)} → {row.out ? formatBytes(row.out.size) : "…"}
                    </span>
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
