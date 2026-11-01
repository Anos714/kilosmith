/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  DropZone,
  IconButton,
  MiniButton,
  Panel,
  StatusTag,
} from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { canvasOf, decodeImage } from "@/lib/image";
import { buildIco } from "@/lib/ico";
import { formatBytes } from "@/lib/format";
import { makeZip, saveBlob } from "@/lib/zip";

const SIZES = [16, 32, 48, 180, 192, 512] as const;

type Source = { url: string; bitmap: ImageBitmap; name: string };

/** Preview object URLs are built once here, at generation time, never during render. */
type KitFile = { name: string; label: string; blob: Blob; url: string; px: number };

function squareIcon(bitmap: ImageBitmap, size: number) {
  const canvas = canvasOf(size, size);
  const ctx = canvas.getContext("2d")!;
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

async function buildKit(bitmap: ImageBitmap): Promise<KitFile[]> {
  const pngs: { size: number; blob: Blob; png: Uint8Array }[] = [];
  for (const size of SIZES) {
    const canvas = squareIcon(bitmap, size);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) continue;
    pngs.push({ size, blob, png: new Uint8Array(await blob.arrayBuffer()) });
  }

  const ico = buildIco(
    pngs.filter((entry) => entry.size <= 48).map((entry) => ({ size: entry.size, png: entry.png }))
  );

  const list: KitFile[] = [
    {
      name: "favicon.ico",
      label: "favicon.ico",
      blob: ico,
      url: URL.createObjectURL(ico),
      px: 48,
    },
    ...pngs.map((entry) => {
      const name = entry.size === 180 ? "apple-touch-icon.png" : `favicon-${entry.size}.png`;
      return {
        name,
        label: name,
        blob: entry.blob,
        url: URL.createObjectURL(entry.blob),
        px: entry.size,
      };
    }),
  ];
  return list;
}

export default function FaviconTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [files, setFiles] = useState<KitFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const sourceRef = useRef<Source | null>(null);
  const filesRef = useRef<KitFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<number | null>(null);

  // Generation counter: every drop bumps runId, so the newest request always wins.
  const runId = useRef(0);
  const running = useRef(false);
  const pending = useRef<{ bitmap: ImageBitmap; gen: number } | null>(null);
  const activeBitmap = useRef<ImageBitmap | null>(null);

  useEffect(() => {
    return () => {
      const current = sourceRef.current;
      if (current) URL.revokeObjectURL(current.url);
      for (const entry of filesRef.current) URL.revokeObjectURL(entry.url);
      filesRef.current = [];
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      // close() is idempotent, so overlapping refs are safe
      current?.bitmap.close();
      pending.current?.bitmap.close();
      activeBitmap.current?.close();
    };
  }, []);

  async function onFiles(input: File[]) {
    const file = input.find((entry) => entry.type.startsWith("image/"));
    if (!file) {
      setError("That is not an image — a JPG, PNG or WebP behaves best.");
      return;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeImage(file);
    } catch {
      setError("Could not decode that file. A plain JPG or PNG usually works better.");
      return;
    }
    setError(null);

    const previous = sourceRef.current;
    if (previous) {
      URL.revokeObjectURL(previous.url);
      // The build loop may still be drawing from the old bitmap — don't close it
      // out from under it; its pass-end check (or the pending-swap below) does.
      if (previous.bitmap !== activeBitmap.current && previous.bitmap !== pending.current?.bitmap) {
        previous.bitmap.close();
      }
    }

    const dropped = pending.current;
    if (dropped && dropped.bitmap !== bitmap) dropped.bitmap.close();

    const next: Source = { url: URL.createObjectURL(file), bitmap, name: file.name };
    sourceRef.current = next;
    setSource(next);
    pending.current = { bitmap, gen: ++runId.current };
    void drain();
  }

  /** Processes the newest pending bitmap; re-runs (never drops) if a newer one arrived mid-build. */
  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current) {
        const job = pending.current;
        pending.current = null;
        activeBitmap.current = job.bitmap;
        setBusy(true);

        let list: KitFile[] | null = null;
        try {
          list = await buildKit(job.bitmap);
        } catch {
          setError("Could not render those icons. Try a smaller or simpler image.");
        }

        activeBitmap.current = null;
        if (job.bitmap !== sourceRef.current?.bitmap) job.bitmap.close();
        if (!list) continue;

        if (job.gen !== runId.current) {
          // A newer logo landed mid-build — throw these URLs away and rebuild for it.
          for (const entry of list) URL.revokeObjectURL(entry.url);
          continue;
        }

        for (const entry of filesRef.current) URL.revokeObjectURL(entry.url);
        filesRef.current = list;
        setFiles(list);
        setBusy(false);
      }
      setBusy(false);
    } finally {
      running.current = false;
    }
  }

  async function copySnippet() {
    if (!navigator.clipboard?.writeText) {
      setCopied("failed");
      setError("No clipboard in this browser — select the tags and copy by hand.");
      return;
    }
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setError(null);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied("idle"), 1600);
  }

  async function downloadKit() {
    if (!filesRef.current.length || zipping) return;
    setZipping(true);
    try {
      const zip: Record<string, Uint8Array> = {};
      // Names here are a fixed set (favicon.ico, favicon-N.png, apple-touch-icon.png),
      // so zipName() can never see a collision.
      for (const entry of filesRef.current) {
        zip[entry.name] = new Uint8Array(await entry.blob.arrayBuffer());
      }
      zip["manifest.webmanifest"] = new TextEncoder().encode(
        JSON.stringify(
          {
            name: "Your app",
            short_name: "App",
            icons: [
              { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
              { src: "/favicon-512.png", sizes: "512x512", type: "image/png" },
            ],
            theme_color: "#fff9ee",
            background_color: "#fff9ee",
            display: "standalone",
          },
          null,
          2
        )
      );
      zip["snippet.txt"] = new TextEncoder().encode(SNIPPET);
      saveBlob(await makeZip(zip), "kilosmith-favicons.zip");
    } catch {
      setError("The kit would not pack into a zip — give it another go.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        aria-label="Add a logo for the icon kit"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {!source ? (
        <div>
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-ink bg-card px-3 py-2 shadow-[2px_2px_0_var(--color-shadow)]">
              <StatusTag state="error" />
              <p className="text-[12.5px] text-error">{error}</p>
            </div>
          )}
          <DropZone
            onFiles={(input) => void onFiles(input)}
            accent="bg-aqua"
            doodle="a tiny face for your site"
            title="Drop a square logo or photo"
            hint="You get .ico, PNG sizes for iOS and Android, plus a manifest and the tags to paste."
          />
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
            <p className="font-[family-name:var(--font-display)] text-[13.5px] text-ink-2">
              {files.length || 0} icon files in the kit
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {busy ? (
                <StatusTag state="working" />
              ) : error ? (
                <StatusTag state="error" text="failed" />
              ) : files.length ? (
                <StatusTag state="done" />
              ) : null}
              <MiniButton onClick={() => inputRef.current?.click()}>+ new logo</MiniButton>
            </div>
          </div>
          {error && <p className="mb-3 -mt-1 text-[12.5px] leading-snug text-error">{error}</p>}

          <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
            <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
              <div className="flex items-center gap-3">
                <div className="thumb bg-checker size-14 shrink-0">
                  <img src={source.url} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-[14px] font-medium text-ink">
                    {source.name}
                  </p>
                  <p className="text-[12.5px] text-muted">Square crop, centred</p>
                </div>
              </div>

              <Button className="mt-4 w-full" onClick={downloadKit} disabled={!files.length || zipping}>
                <IconDownload size={14} /> {zipping ? "Packing…" : "Download icon kit"}
              </Button>

              <div className="mt-4 hairline pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-[family-name:var(--font-display)] text-[12.5px] font-medium text-ink-2">
                    Paste into &lt;head&gt;
                  </p>
                  <MiniButton onClick={copySnippet} title="Copy the head tags to your clipboard">
                    {copied === "done" ? "copied!" : copied === "failed" ? "oops" : "copy"}
                  </MiniButton>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-2xl border-2 border-ink bg-card p-2.5 font-[family-name:var(--font-outlier)] text-[11.5px] leading-relaxed text-ink-2">
                  {SNIPPET}
                </pre>
              </div>
            </Panel>

            <div className="order-1 min-w-0 md:order-2">
              {files.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 bg-card">
                  {busy ? (
                    <StatusTag state="working" />
                  ) : error ? (
                    <p className="px-4 text-center text-[12.5px] text-error">
                      Nothing cooked yet — drop a different file and try again.
                    </p>
                  ) : (
                    <p className="text-[12.5px] text-muted">…</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                  {files.map((entry) => (
                    <div key={entry.name} className="tile">
                      <div className="bg-checker flex items-end justify-center p-4" style={{ height: 118 }}>
                        <img
                          src={entry.url}
                          alt={entry.label}
                          style={{
                            width: Math.min(88, Math.max(16, entry.px)),
                            height: Math.min(88, Math.max(16, entry.px)),
                          }}
                        />
                      </div>
                      <div className="tile-foot">
                        <span className="min-w-0 truncate" title={entry.label}>
                          {entry.label}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[11.5px] text-muted tabular-nums">
                            {formatBytes(entry.blob.size)}
                          </span>
                          <IconButton
                            label={`Download ${entry.label}`}
                            onClick={() => saveBlob(entry.blob, entry.name)}
                          >
                            <IconDownload size={12} />
                          </IconButton>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />`;
