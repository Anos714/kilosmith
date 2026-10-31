"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DropZone, Field, Panel, Segmented } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { decodeImage } from "@/lib/image";
import { slug } from "@/lib/format";
import { saveBlob } from "@/lib/zip";

const MAX_EDGE = 2000;

export default function MemeTool() {
  const [source, setSource] = useState<{ url: string; bitmap: ImageBitmap } | null>(null);
  const [name, setName] = useState("meme");
  const [top, setTop] = useState("WHEN THE BUILD");
  const [bottom, setBottom] = useState("ACTUALLY PASSES");
  const [scale, setScale] = useState(0); // 0 = auto
  const [upper, setUpper] = useState<"upper" | "normal">("upper");
  const [color, setColor] = useState("#ffffff");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    const ratio = Math.min(1, MAX_EDGE / Math.max(source.bitmap.width, source.bitmap.height));
    const w = Math.round(source.bitmap.width * ratio);
    const h = Math.round(source.bitmap.height * ratio);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source.bitmap, 0, 0, w, h);

    const transform = (text: string) => (upper === "upper" ? text.toUpperCase() : text);
    const topText = transform(top).trim();
    const bottomText = transform(bottom).trim();

    const drawBlock = (text: string, position: "top" | "bottom") => {
      if (!text) return;
      let size = scale ? (scale / 100) * (h / 6) : h / 7;
      const maxWidth = w * 0.92;

      const layout = (fontSize: number) => {
        ctx.font = `900 ${fontSize}px Impact, "Anton", "Arial Black", system-ui, sans-serif`;
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (ctx.measureText(candidate).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      let lines = layout(size);
      if (!scale) {
        while (lines.length > 3 && size > 16) {
          size -= Math.max(1, size * 0.06);
          lines = layout(size);
        }
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, size / 9);
      ctx.strokeStyle = "rgba(0,0,0,0.92)";
      ctx.fillStyle = color;

      const lineHeight = size * 1.02;
      const blockHeight = lines.length * lineHeight;
      const startY =
        position === "top" ? Math.max(size, blockHeight) * 0.98 : h - (blockHeight - size * 0.35);

      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        ctx.strokeText(line, w / 2, y, maxWidth);
        ctx.fillText(line, w / 2, y, maxWidth);
      });
    };

    drawBlock(topText, "top");
    drawBlock(bottomText, "bottom");
  }, [source, top, bottom, scale, upper, color]);

  async function onFiles(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith("image/"));
    if (!file) return;
    const bitmap = await decodeImage(file);
    setSource((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return { url: URL.createObjectURL(file), bitmap };
    });
    setName(slug(file.name));
  }

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) saveBlob(blob, `${name}-meme.png`);
  }

  if (!source) {
    return (
      <DropZone
        onFiles={onFiles}
        title="Drop a template to meme"
        hint="Any image works. Text, size and colour update live."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[268px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <Field label="Top text">
          <input
            value={top}
            onChange={(event) => setTop(event.target.value)}
            placeholder="when the build"
            className="w-full rounded-lg border border-line bg-ink px-2.5 py-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-line-2"
          />
        </Field>
        <div className="mt-3">
          <Field label="Bottom text">
            <input
              value={bottom}
              onChange={(event) => setBottom(event.target.value)}
              placeholder="actually passes"
              className="w-full rounded-lg border border-line bg-ink px-2.5 py-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-line-2"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Text size" hint="Auto fits the longest line. Slide right to go bigger.">
            <input
              type="range"
              min={0}
              max={100}
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Case">
            <Segmented
              options={[
                { value: "upper", label: "UPPER" },
                { value: "normal", label: "Normal" },
              ]}
              value={upper}
              onChange={(value) => setUpper(value as "upper" | "normal")}
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Text colour</p>
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
          />
        </div>

        <div className="mt-5 flex gap-2 border-t border-line pt-4">
          <Button className="flex-1" onClick={download}>
            <IconDownload size={14} /> PNG
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              URL.revokeObjectURL(source.url);
              setSource(null);
            }}
          >
            change
          </Button>
        </div>
      </Panel>

      <div className="order-1 min-w-0 md:order-2">
        <div className="rounded-xl border border-line bg-checker p-3">
          <canvas
            ref={canvasRef}
            className="mx-auto block max-h-[560px] w-auto max-w-full rounded-md"
            aria-label="Meme preview"
          />
        </div>
      </div>
    </div>
  );
}
