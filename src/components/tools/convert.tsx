"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DropZone, Field, Panel, Segmented, Spinner } from "@/components/ui";
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
import { makeZip, saveBlob } from "@/lib/zip";

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

  const commit = (next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
  };

  async function run() {
    for (const row of [...rowsRef.current]) {
      commit(
        rowsRef.current.map((entry) =>
          entry.id === row.id ? { ...entry, status: "working" } : entry
        )
      );
      try {
        const bitmap = await decodeImage(row.file);
        const canvas = drawCover(
          bitmap,
          undefined,
          format === "jpeg" || format === "avif" ? "#ffffff" : undefined
        );
        bitmap.close?.();
        const blob = await toBlob(canvas, format, quality / 100);
        if (row.out) URL.revokeObjectURL(row.out.url);
        commit(
          rowsRef.current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  status: "done",
                  out: { blob, url: URL.createObjectURL(blob), size: blob.size },
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
                  out: undefined,
                  error: error instanceof Error ? error.message : "Could not convert this file",
                }
              : entry
          )
        );
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
    if (!list.length) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const row of list) {
        const blob = row.out!.blob;
        files[`${slug(row.name)}.${extensionFor(blob)}`] = new Uint8Array(await blob.arrayBuffer());
      }
      saveBlob(await makeZip(files), `sizekit-${format}.zip`);
    } finally {
      setZipping(false);
    }
  }

  const totalOut = rows.reduce((sum, row) => sum + (row.out?.size ?? 0), 0);
  const info = formatInfo(format);
  const missing = rows.filter((row) => row.status === "done" && row.out).length;

  return (
    <div>
      {rows.length === 0 ? (
        <DropZone
          onFiles={add}
          multiple
          title="Drop images to convert"
          hint="PNG, JPEG, WebP and AVIF, in bulk. Alpha is preserved where the format allows it."
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
                onChange={(value) => setFormat(value as OutFormat)}
              />
            </Field>

            {info.lossy && (
              <div className="mt-4">
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

            {!info.alpha && (
              <p className="mt-3 rounded-lg border border-line bg-ink px-2.5 py-2 text-[11px] leading-snug text-zinc-500">
                {info.label} has no transparency — transparent pixels are composited on white.
              </p>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {missing}/{rows.length} done
              </p>
              <p className="font-mono text-[11px] text-zinc-400">{formatBytes(totalOut)}</p>
            </div>

            <Button className="mt-3 w-full" onClick={downloadAll} disabled={!totalOut || zipping}>
              {zipping ? "Packing…" : `Download all · ${formatBytes(totalOut)}`}
            </Button>
          </Panel>

          <div className="order-1 min-w-0 space-y-2 md:order-2">
            <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2">
              <p className="font-mono text-[10.5px] text-zinc-500">
                {rows.length} file{rows.length > 1 ? "s" : ""} → {info.label}
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="group overflow-hidden rounded-lg border border-line bg-panel"
                >
                  <div className="relative bg-checker" style={{ height: 120 }}>
                    {row.out ? (
                      <img
                        src={row.out.url}
                        alt={row.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {row.status === "error" ? (
                          <span
                            title={row.error}
                            className="max-w-full truncate px-2 font-mono text-[10px] text-red-400"
                          >
                            {row.error ?? "failed"}
                          </span>
                        ) : (
                          <Spinner />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="absolute right-1.5 top-1.5 rounded-md bg-ink/80 p-1 text-zinc-400 opacity-0 backdrop-blur transition group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <IconClose size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5">
                    <span className="truncate font-mono text-[10px] text-zinc-500">
                      {formatBytes(row.size)} → {row.out ? formatBytes(row.out.size) : "…"}
                    </span>
                    <button
                      type="button"
                      disabled={!row.out}
                      onClick={() =>
                        row.out && saveBlob(row.out.blob, `${slug(row.name)}.${extensionFor(row.out.blob)}`)
                      }
                      className="text-zinc-500 transition hover:text-acid disabled:opacity-30"
                      aria-label="Download"
                    >
                      <IconDownload size={12} />
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
