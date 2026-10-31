"use client";

import { useRef, useState } from "react";
import { Button, DropZone, Panel } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { canvasOf, decodeImage } from "@/lib/image";
import { buildIco } from "@/lib/ico";
import { formatBytes } from "@/lib/format";
import { makeZip, saveBlob } from "@/lib/zip";

const SIZES = [16, 32, 48, 180, 192, 512] as const;

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

export default function FaviconTool() {
  const [source, setSource] = useState<{ url: string; bitmap: ImageBitmap; name: string } | null>(null);
  const [files, setFiles] = useState<{ name: string; blob: Blob; label: string }[]>([]);
  const building = useRef(false);

  async function onFiles(input: File[]) {
    const file = input.find((entry) => entry.type.startsWith("image/"));
    if (!file) return;
    const bitmap = await decodeImage(file);
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { url: URL.createObjectURL(file), bitmap, name: file.name };
    });
    await generate(bitmap);
  }

  async function generate(bitmap: ImageBitmap) {
    if (building.current) return;
    building.current = true;
    try {
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

      const list: { name: string; blob: Blob; label: string }[] = [
        { name: "favicon.ico", blob: ico, label: "favicon.ico" },
        ...pngs.map((entry) => ({
          name: entry.size === 180 ? "apple-touch-icon.png" : `favicon-${entry.size}.png`,
          blob: entry.blob,
          label: entry.size === 180 ? "apple-touch-icon.png" : `favicon-${entry.size}.png`,
        })),
      ];
      setFiles(list);
    } finally {
      building.current = false;
    }
  }

  async function downloadKit() {
    if (!files.length) return;
    const zip: Record<string, Uint8Array> = {};
    for (const entry of files) {
      zip[entry.name] = new Uint8Array(await entry.blob.arrayBuffer());
    }
    zip["manifest.webmanifest"] = new TextEncoder().encode(
      JSON.stringify(
        {
          name: "Your app",
          short_name: "App",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
          theme_color: "#08090b",
          background_color: "#08090b",
          display: "standalone",
        },
        null,
        2
      )
    );
    zip["snippet.txt"] = new TextEncoder().encode(SNIPPET);
    saveBlob(await makeZip(zip), "sizekit-favicons.zip");
  }

  if (!source) {
    return (
      <DropZone
        onFiles={onFiles}
        title="Drop a square logo or photo"
        hint="You get .ico, PNG sizes for iOS and Android, plus a manifest and the tags to paste."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <div className="flex items-center gap-3">
          <div className="size-14 overflow-hidden rounded-xl border border-line bg-checker">
            <img src={source.url} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] text-zinc-300">{source.name}</p>
            <p className="font-mono text-[10px] text-zinc-600">square crop, centred</p>
          </div>
        </div>

        <Button className="mt-4 w-full" onClick={downloadKit}>
          <IconDownload size={14} /> Download icon kit
        </Button>

        <div className="mt-4 border-t border-line pt-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            Paste into &lt;head&gt;
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-ink p-2.5 font-mono text-[10px] leading-relaxed text-zinc-400">
            {SNIPPET}
          </pre>
        </div>
      </Panel>

      <div className="order-1 min-w-0 md:order-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((entry) => (
            <div key={entry.name} className="overflow-hidden rounded-lg border border-line bg-panel">
              <div className="flex items-end justify-center bg-checker p-4" style={{ height: 118 }}>
                <img
                  src={URL.createObjectURL(entry.blob)}
                  alt={entry.label}
                  style={{
                    width: Math.min(88, Math.max(16, Number(entry.label.match(/\d+/)?.[0] ?? 48))),
                    height: Math.min(88, Math.max(16, Number(entry.label.match(/\d+/)?.[0] ?? 48))),
                  }}
                  className="rounded"
                />
              </div>
              <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
                <span className="truncate font-mono text-[10px] text-zinc-500">{entry.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-600">{formatBytes(entry.blob.size)}</span>
                  <button
                    type="button"
                    onClick={() => saveBlob(entry.blob, entry.name)}
                    className="text-zinc-500 transition hover:text-acid"
                    aria-label={`Download ${entry.label}`}
                  >
                    <IconDownload size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />`;
