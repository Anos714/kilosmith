"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button, DropZone, Field, Panel, Segmented } from "@/components/ui";
import { IconClose, IconDownload, IconSpark, IconUpload } from "@/components/icons";
import { decodeImage } from "@/lib/image";
import { slug } from "@/lib/format";
import { saveBlob } from "@/lib/zip";
import { MEME_TEMPLATES } from "@/lib/memes.generated";
import {
  MEME_FONTS,
  MEME_TAGS,
  defaultTexts,
  drawMeme,
  matchesTag,
  newText,
  type BoxRect,
  type MemeFont,
  type MemeText,
} from "@/lib/meme";

const MAX_EDGE = 2000;
const MAX_BOXES = 6;

type Picture = {
  bitmap: ImageBitmap;
  name: string;
  slug: string | null;
};

export default function MemeTool() {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [texts, setTexts] = useState<MemeText[]>(() => defaultTexts(2));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [background, setBackground] = useState("#0b0d10");
  const [note, setNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectsRef = useRef<BoxRect[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Deriving the active caption keeps the panel valid after a delete without
  // scheduling a state update from an effect.
  const active = texts.find((item) => item.id === activeId) ?? texts[0] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !picture) return;

    const scale = Math.min(1, MAX_EDGE / Math.max(picture.bitmap.width, picture.bitmap.height));
    const width = Math.max(1, Math.round(picture.bitmap.width * scale));
    const height = Math.max(1, Math.round(picture.bitmap.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    rectsRef.current = drawMeme(ctx, {
      width,
      height,
      image: picture.bitmap,
      fit,
      background,
      texts,
      activeId: active?.id ?? null,
      guides: true,
    });
  }, [picture, texts, fit, background, active?.id]);

  function patch(id: string, changes: Partial<MemeText>) {
    setTexts((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  async function adopt(picture: Picture, boxes: number) {
    const next = defaultTexts(boxes);
    setPicture(picture);
    setTexts(next);
    setActiveId(next[0]?.id ?? null);
    setNote(null);
  }

  const pickTemplate = useCallback(async (slugName: string, name: string, boxes: number) => {
    try {
      const response = await fetch(`/memes/${slugName}.webp`);
      if (!response.ok) throw new Error("Template could not be loaded");
      const bitmap = await decodeImage(await response.blob());
      await adopt({ bitmap, name, slug: slugName }, boxes);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Template could not be loaded");
    }
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files.find((entry) => entry.type.startsWith("image/"));
      if (!file) return;
      try {
        const bitmap = await decodeImage(file);
        await adopt(
          { bitmap, name: file.name.replace(/\.[a-z0-9]+$/i, ""), slug: null },
          texts.length || 2
        );
      } catch {
        setNote("That file could not be decoded as an image.");
      }
    },
    [texts.length]
  );

  async function renderBlob(type: "image/png" | "image/jpeg"): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas || !picture) return null;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;
    drawMeme(ctx, {
      width: offscreen.width,
      height: offscreen.height,
      image: picture.bitmap,
      fit,
      background,
      texts,
      guides: false,
    });
    return new Promise((resolve) =>
      offscreen.toBlob(resolve, type, type === "image/jpeg" ? 0.92 : undefined)
    );
  }

  async function download(type: "image/png" | "image/jpeg") {
    const blob = await renderBlob(type);
    if (!blob) return;
    const extension = type === "image/png" ? "png" : "jpg";
    saveBlob(blob, `${slug(picture?.slug ?? picture?.name ?? "meme")}-meme.${extension}`);
    setNote(`Saved as ${extension.toUpperCase()}.`);
  }

  async function copy() {
    try {
      const blob = await renderBlob("image/png");
      if (!blob || typeof ClipboardItem === "undefined") throw new Error("unsupported");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNote("Copied to the clipboard.");
    } catch {
      setNote("This browser would not let the page copy an image — download it instead.");
    }
  }

  /* ---------------------------------- drag ---------------------------------- */

  function pointOf(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      width: canvas.width,
      height: canvas.height,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = pointOf(event);
    const hit = [...rectsRef.current].reverse().find(
      (rect) =>
        point.x >= rect.x - 12 &&
        point.x <= rect.x + rect.w + 12 &&
        point.y >= rect.y - 10 &&
        point.y <= rect.y + rect.h + 10
    );
    if (!hit) return;
    const item = texts.find((entry) => entry.id === hit.id);
    if (!item) return;
    setActiveId(item.id);
    dragRef.current = {
      id: item.id,
      dx: point.x - item.x * point.width,
      dy: point.y - item.y * point.height,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety; dragging still works without it.
    }
    event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointOf(event);
    const rect = rectsRef.current.find((entry) => entry.id === drag.id);
    const blockHeight = rect ? rect.h : 0;
    const item = texts.find((entry) => entry.id === drag.id);
    if (!item) return;

    // Keep most of the block on the canvas, but let a wide caption still slide
    // a little instead of freezing at the centre.
    const half = (rect?.w ?? 0) / point.width / 2;
    const margin = Math.min(half * 0.55, 0.42);
    const x = Math.min(1 - margin, Math.max(margin, (point.x - drag.dx) / point.width));
    let y = (point.y - drag.dy) / point.height;

    // Keep the caption on the canvas: the anchor can sit anywhere inside it as
    // long as the whole block still fits.
    const span = blockHeight / point.height;
    if (item.anchor === "top") y = Math.min(y, 1 - span - 0.01);
    else if (item.anchor === "bottom") y = Math.max(y, span + 0.01);
    else {
      y = Math.min(1 - span / 2 - 0.01, Math.max(span / 2 + 0.01, y));
    }

    patch(drag.id, { x, y: Math.min(1, Math.max(0, y)) });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // ignore
      }
    }
  }

  /* ---------------------------------- view ---------------------------------- */

  if (!picture) {
    return (
      <div className="space-y-4">
        <DropZone
          onFiles={onFiles}
          title="Start from a template — or drop your own image"
          hint="100 ready-made templates below. Your photo never leaves this tab."
        />
        <TemplateBrowser onPick={pickTemplate} onUpload={onFiles} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[288px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Captions</p>
          <button
            type="button"
            onClick={() => {
              if (texts.length >= MAX_BOXES) return;
              const item = newText(texts);
              setTexts((current) => [...current, item]);
              setActiveId(item.id);
            }}
            disabled={texts.length >= MAX_BOXES}
            className="rounded-md border border-line px-2 py-1 font-mono text-[10px] text-zinc-400 transition hover:border-line-2 hover:text-zinc-100 disabled:opacity-40"
          >
            + add text
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {texts.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={`max-w-full truncate rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                item.id === active?.id
                  ? "border-acid/40 bg-acid/10 text-acid"
                  : "border-line text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {item.text.trim() ? item.text.trim().slice(0, 14) : `text ${index + 1}`}
            </button>
          ))}
        </div>

        {active && (
          <>
            <div className="mt-3">
              <textarea
                value={active.text}
                onChange={(event) => patch(active.id, { text: event.target.value })}
                rows={2}
                autoFocus
                placeholder="when the build finally passes"
                className="w-full resize-y rounded-lg border border-line bg-ink px-2.5 py-2 text-[12px] leading-snug text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-line-2"
              />
              <p className="mt-1 text-[10.5px] text-zinc-600">
                Drag the caption on the image to place it. Enter makes a new line.
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <input
                  type="checkbox"
                  checked={active.auto}
                  onChange={(event) => patch(active.id, { auto: event.target.checked })}
                  className="size-3.5 accent-acid"
                />
                Auto size
              </label>
              <span className="font-mono text-[10px] text-zinc-500">
                {active.auto ? "fit width" : `${Math.round(active.size * 100)}%`}
              </span>
            </div>

            <input
              type="range"
              min={4}
              max={30}
              value={Math.round(active.size * 100)}
              disabled={active.auto}
              onChange={(event) => patch(active.id, { size: Number(event.target.value) / 100 })}
              className="mt-1 w-full disabled:opacity-40"
              aria-label="Text size"
            />

            <div className="mt-4">
              <Field label="Font">
                <Segmented
                  options={(Object.keys(MEME_FONTS) as MemeFont[]).map((id) => ({
                    value: id,
                    label: MEME_FONTS[id].label,
                  }))}
                  value={active.font}
                  onChange={(value) => patch(active.id, { font: value })}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Case">
                <Segmented
                  options={[
                    { value: "upper", label: "UPPER" },
                    { value: "normal", label: "Normal" },
                  ]}
                  value={active.upper ? "upper" : "normal"}
                  onChange={(value) => patch(active.id, { upper: value === "upper" })}
                />
              </Field>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Fill</p>
              <input
                type="color"
                value={active.color}
                onChange={(event) => patch(active.id, { color: event.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
                aria-label="Text colour"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <input
                  type="checkbox"
                  checked={active.outlineOn}
                  onChange={(event) => patch(active.id, { outlineOn: event.target.checked })}
                  className="size-3.5 accent-acid"
                />
                Outline
              </label>
              <input
                type="color"
                value={active.outline}
                disabled={!active.outlineOn}
                onChange={(event) => patch(active.id, { outline: event.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent disabled:opacity-40"
                aria-label="Outline colour"
              />
            </div>

            {texts.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setTexts((current) => current.filter((item) => item.id !== active.id));
                }}
                className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 transition hover:text-red-400"
              >
                <IconClose size={11} /> delete this caption
              </button>
            )}
          </>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <Field label="Image fit">
            <Segmented
              options={[
                { value: "cover", label: "Fill" },
                { value: "contain", label: "Fit" },
              ]}
              value={fit}
              onChange={setFit}
            />
          </Field>
          {fit === "contain" && (
            <div className="mt-2 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Backdrop</p>
              <input
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
                aria-label="Backdrop colour"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          <Button className="flex-1" onClick={() => download("image/png")}>
            <IconDownload size={14} /> PNG
          </Button>
          <Button variant="secondary" onClick={() => download("image/jpeg")}>
            JPG
          </Button>
          <Button variant="secondary" onClick={copy}>
            copy
          </Button>
        </div>

        <button
          type="button"
          onClick={() => {
            setPicture(null);
            setTexts(defaultTexts(2));
            setActiveId(null);
          }}
          className="mt-3 w-full rounded-lg border border-line px-2 py-1.5 font-mono text-[10px] text-zinc-500 transition hover:text-zinc-200"
        >
          change image
        </button>

        {note && <p className="mt-2 text-[11px] leading-snug text-zinc-500">{note}</p>}
      </Panel>

      <div className="order-1 min-w-0 space-y-4 md:order-2">
        <div className="rounded-xl border border-line bg-checker p-3">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="mx-auto block max-h-[520px] w-auto max-w-full touch-none rounded-md cursor-grab active:cursor-grabbing"
            aria-label="Meme preview"
          />
        </div>
        <p className="-mt-1 text-center font-mono text-[10px] text-zinc-600">
          {picture.name} · drag a caption to move it
        </p>

        <TemplateBrowser onPick={pickTemplate} onUpload={onFiles} activeSlug={picture.slug} compact />
      </div>
    </div>
  );
}

/* ------------------------------- templates -------------------------------- */

const TemplateBrowser = memo(function TemplateBrowser({
  onPick,
  onUpload,
  activeSlug,
  compact = false,
}: {
  onPick: (slug: string, name: string, boxes: number) => void;
  onUpload: (files: File[]) => void;
  activeSlug?: string | null;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const list = MEME_TEMPLATES.filter(
    (template) =>
      matchesTag(template.name, tag) &&
      (!needle || template.name.toLowerCase().includes(needle))
  );

  return (
    <Panel className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          {compact ? "Swap template" : `${MEME_TEMPLATES.length} templates`}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search"
            className="w-28 rounded-md border border-line bg-ink px-2 py-1 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-line-2"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-zinc-400 transition hover:border-line-2 hover:text-zinc-100"
          >
            <IconUpload size={11} /> yours
          </button>
        </div>
      </div>

      <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto">
        {[{ id: "all", label: "All" }, ...MEME_TAGS].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTag(entry.id)}
            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] transition ${
              tag === entry.id
                ? "border-acid/40 bg-acid/10 text-acid"
                : "border-line text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        className={`no-scrollbar mt-2 grid grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8 ${
          compact ? "max-h-[228px]" : "max-h-[420px]"
        }`}
      >
        {list.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template.slug, template.name, template.boxes)}
            title={template.name}
            className={`group relative aspect-square overflow-hidden rounded-md border bg-panel-2 transition ${
              activeSlug === template.slug
                ? "border-acid/60 ring-1 ring-acid/30"
                : "border-line hover:border-line-2"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/memes/thumbs/${template.slug}.webp`}
              alt={template.name}
              width={240}
              height={240}
              loading="lazy"
              decoding="async"
              className="size-full object-cover opacity-90 transition group-hover:opacity-100"
            />
          </button>
        ))}
        {!list.length && (
          <p className="col-span-full py-6 text-center font-mono text-[10px] text-zinc-600">
            nothing matches “{query}”
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onUpload(files);
        }}
      />

      <p className="mt-2 flex items-center gap-1.5 font-mono text-[9.5px] text-zinc-600">
        <IconSpark size={10} /> templates via Imgflip · {MEME_TEMPLATES.length} included, no upload
      </p>
    </Panel>
  );
});
