"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Button,
  Chip,
  DropZone,
  Field,
  IconButton,
  MiniButton,
  Panel,
  Segmented,
  StatusTag,
} from "@/components/ui";
import {
  IconCheck,
  IconClose,
  IconDownload,
  IconSpark,
  IconUpload,
} from "@/components/icons";
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

type Note = { tone: "done" | "error"; text: string };
type Task = "png" | "jpg" | "copy";

export default function MemeTool() {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [texts, setTexts] = useState<MemeText[]>(() => defaultTexts(2));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [background, setBackground] = useState("#0b0d10");
  const [note, setNote] = useState<Note | null>(null);
  const [working, setWorking] = useState(false);
  const [task, setTask] = useState<Task | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectsRef = useRef<BoxRect[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  // Mirror of `picture` so the previous bitmap can be closed on replace and unmount.
  const pictureRef = useRef<Picture | null>(null);
  // Only the newest load may commit state; older decodes get closed and dropped.
  const loadId = useRef(0);

  // Deriving the active caption keeps the panel valid after a delete without
  // scheduling a state update from an effect.
  const active = texts.find((item) => item.id === activeId) ?? texts[0] ?? null;

  // navigator.clipboard is missing outright on http/insecure origins, so the
  // copy button says so instead of failing when clicked.
  const canCopy =
    typeof navigator !== "undefined" &&
    !!navigator.clipboard?.write &&
    typeof ClipboardItem !== "undefined";

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

  // The tool stays mounted across a browsing session; when it finally unmounts,
  // hand the live bitmap back to the browser.
  useEffect(
    () => () => {
      pictureRef.current?.bitmap.close();
      pictureRef.current = null;
    },
    []
  );

  function patch(id: string, changes: Partial<MemeText>) {
    setTexts((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  const adopt = useCallback((next: Picture, boxes: number) => {
    const previous = pictureRef.current;
    if (previous && previous !== next) previous.bitmap.close();
    pictureRef.current = next;
    const captions = defaultTexts(boxes);
    setPicture(next);
    setTexts(captions);
    setActiveId(captions[0]?.id ?? null);
    setNote(null);
  }, []);

  const pickTemplate = useCallback(
    async (slugName: string, name: string, boxes: number) => {
      const id = ++loadId.current;
      setWorking(true);
      try {
        const response = await fetch(`/memes/${slugName}.webp`);
        if (!response.ok) throw new Error("Template could not be loaded");
        const bitmap = await decodeImage(await response.blob());
        if (id !== loadId.current) {
          bitmap.close(); // a newer pick won the race
          return;
        }
        adopt({ bitmap, name, slug: slugName }, boxes);
      } catch (error) {
        if (id === loadId.current)
          setNote({
            tone: "error",
            text: error instanceof Error ? error.message : "Template could not be loaded",
          });
      } finally {
        if (id === loadId.current) setWorking(false);
      }
    },
    [adopt]
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files.find((entry) => entry.type.startsWith("image/"));
      if (!file) return;
      const id = ++loadId.current;
      setWorking(true);
      try {
        const bitmap = await decodeImage(file);
        if (id !== loadId.current) {
          bitmap.close(); // a newer pick won the race
          return;
        }
        adopt({ bitmap, name: file.name.replace(/\.[a-z0-9]+$/i, ""), slug: null }, texts.length || 2);
      } catch {
        if (id === loadId.current)
          setNote({ tone: "error", text: "That file could not be decoded as an image." });
      } finally {
        if (id === loadId.current) setWorking(false);
      }
    },
    [adopt, texts.length]
  );

  function startOver() {
    loadId.current++; // a late decode from an in-flight load closes itself instead of adopting
    pictureRef.current?.bitmap.close();
    pictureRef.current = null;
    setWorking(false);
    setNote(null);
    setPicture(null);
    setTexts(defaultTexts(2));
    setActiveId(null);
  }

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
    setTask(type === "image/png" ? "png" : "jpg");
    try {
      const blob = await renderBlob(type);
      if (!blob) throw new Error("This browser would not encode the image.");
      const extension = type === "image/png" ? "png" : "jpg";
      saveBlob(blob, `${slug(picture?.slug ?? picture?.name ?? "meme")}-meme.${extension}`);
      setNote({ tone: "done", text: `Saved as ${extension.toUpperCase()}.` });
    } catch (error) {
      setNote({
        tone: "error",
        text: error instanceof Error ? error.message : "The export hit a snag. Try again.",
      });
    } finally {
      setTask(null);
    }
  }

  async function copy() {
    setTask("copy");
    try {
      if (!canCopy) throw new Error("The clipboard needs a secure origin. Download it instead.");
      const blob = await renderBlob("image/png");
      if (!blob) throw new Error("This browser would not encode the image.");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNote({ tone: "done", text: "Copied to the clipboard." });
    } catch (error) {
      setNote({
        tone: "error",
        text:
          error instanceof Error ? error.message : "This browser would not let the page copy an image.",
      });
    } finally {
      setTask(null);
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

  /* --------------------------------- status --------------------------------- */

  const status = working ? (
    <StatusTag state="working" text="fetching that one…" />
  ) : task ? (
    <StatusTag state="working" text={task === "copy" ? "copying…" : "saving…"} />
  ) : note ? (
    <StatusTag state={note.tone} text={note.text} />
  ) : picture ? (
    <StatusTag state="done" />
  ) : null;

  /* ---------------------------------- view ---------------------------------- */

  if (!picture) {
    return (
      <div className="space-y-4">
        <DropZone
          onFiles={onFiles}
          accent="bg-butter"
          doodle="go on, be unreasonable"
          title="Start from a template, or drop your own image"
          hint={`${MEME_TEMPLATES.length} ready-made templates below. Your photo never leaves this tab.`}
        />
        {status && <div className="flex justify-center">{status}</div>}
        <TemplateBrowser onPick={pickTemplate} onUpload={onFiles} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[288px_minmax(0,1fr)]">
      <Panel className="order-2 self-start p-4 md:order-1 md:sticky md:top-20">
        <div className="flex items-center justify-between gap-2">
          <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
            Captions{" "}
            <span className="text-[12px] font-normal tabular-nums text-muted">
              {texts.length}/{MAX_BOXES}
            </span>
          </p>
          <MiniButton
            onClick={() => {
              if (texts.length >= MAX_BOXES) return;
              const item = newText(texts);
              setTexts((current) => [...current, item]);
              setActiveId(item.id);
            }}
            disabled={texts.length >= MAX_BOXES}
            title={texts.length >= MAX_BOXES ? "Six is plenty" : "Add another caption"}
          >
            + add text
          </MiniButton>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {texts.map((item, index) => (
            <Chip
              key={item.id}
              active={item.id === active?.id}
              onClick={() => setActiveId(item.id)}
              title={item.text.trim() || undefined}
            >
              <span className="block max-w-[9rem] truncate">
                {item.text.trim() ? item.text.trim().slice(0, 14) : `text ${index + 1}`}
              </span>
            </Chip>
          ))}
        </div>

        {active && (
          <div className="mt-4 space-y-4">
            <div>
              <textarea
                key={active.id}
                value={active.text}
                onChange={(event) => patch(active.id, { text: event.target.value })}
                rows={2}
                autoFocus
                placeholder="when the build finally passes"
                aria-label="Caption text"
                className="field-input w-full resize-y leading-snug"
              />
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                Drag the caption on the image to place it. Enter makes a new line.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={active.auto}
                    onChange={(event) => patch(active.id, { auto: event.target.checked })}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  Auto size
                </label>
                <span className="font-[family-name:var(--font-display)] text-[13px] tabular-nums text-ink-2">
                  {active.auto ? "fits itself" : `${Math.round(active.size * 100)}%`}
                </span>
              </div>

              <input
                type="range"
                min={4}
                max={30}
                step={1}
                value={Math.round(active.size * 100)}
                disabled={active.auto}
                onChange={(event) => {
                  const pct = Number(event.target.value);
                  if (Number.isFinite(pct))
                    patch(active.id, { size: Math.min(30, Math.max(4, pct)) / 100 });
                }}
                className="mt-2 w-full disabled:opacity-40"
                aria-label="Caption text size"
              />
            </div>

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

            <div className="flex items-center justify-between gap-2">
              <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                Fill
              </p>
              <input
                type="color"
                value={active.color}
                onChange={(event) => patch(active.id, { color: event.target.value })}
                className="h-8 w-12"
                aria-label="Text colour"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={active.outlineOn}
                  onChange={(event) => patch(active.id, { outlineOn: event.target.checked })}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Outline
              </label>
              <input
                type="color"
                value={active.outline}
                disabled={!active.outlineOn}
                onChange={(event) => patch(active.id, { outline: event.target.value })}
                className="h-8 w-12 disabled:opacity-40"
                aria-label="Outline colour"
              />
            </div>

            {texts.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] leading-snug text-muted">Every caption gets its own style.</p>
                <IconButton
                  onClick={() =>
                    setTexts((current) => current.filter((item) => item.id !== active.id))
                  }
                  label="Delete this caption"
                >
                  <IconClose size={12} />
                </IconButton>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-3 hairline pt-4">
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
            <div className="flex items-center justify-between gap-2">
              <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                Backdrop
              </p>
              <input
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-8 w-12"
                aria-label="Backdrop colour"
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2 hairline pt-4">
          <Button className="flex-1" onClick={() => download("image/png")} disabled={!!task || working}>
            <IconDownload size={14} /> PNG
          </Button>
          <Button variant="secondary" onClick={() => download("image/jpeg")} disabled={!!task || working}>
            JPG
          </Button>
          <Button variant="secondary" onClick={copy} disabled={!canCopy || !!task || working}>
            copy
          </Button>
        </div>
        {!canCopy && (
          <p className="mt-1.5 text-[12px] leading-snug text-muted">
            Copy is off — the clipboard needs https. PNG and JPG still work.
          </p>
        )}

        <MiniButton onClick={startOver} className="mt-3 w-full">
          change image
        </MiniButton>
      </Panel>

      <div className="order-1 min-w-0 space-y-4 md:order-2">
        {/* pop-sm rather than .tile: the hover tilt would skew the canvas pointer maths. */}
        <div className="pop-sm overflow-hidden">
          <div className="bg-checker p-3">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="mx-auto block max-h-[520px] w-auto max-w-full touch-none cursor-grab active:cursor-grabbing"
              aria-label="Meme preview"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2">{picture.name}</p>
          <span className="text-[12px] text-muted">· drag a caption to move it</span>
        </div>

        {status && <div className="flex justify-center">{status}</div>}

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
    <Panel className="p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-display)] text-[13.5px] font-medium text-ink-2">
          {compact ? "Swap template" : `${MEME_TEMPLATES.length} templates`}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search"
            aria-label="Search templates"
            className="field-input w-32 py-1.5"
          />
          <MiniButton onClick={() => inputRef.current?.click()} title="Use your own image">
            <IconUpload size={11} /> yours
          </MiniButton>
        </div>
      </div>

      <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
        {[{ id: "all", label: "All" }, ...MEME_TAGS].map((entry) => (
          <Chip key={entry.id} active={tag === entry.id} onClick={() => setTag(entry.id)}>
            {entry.label}
          </Chip>
        ))}
      </div>

      <div
        className={`no-scrollbar mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7 ${
          compact ? "max-h-[240px]" : "max-h-[440px]"
        } overflow-y-auto pr-1`}
      >
        {list.map((template, index) => (
          <TemplateTile
            key={template.id}
            template={template}
            eager={index === 0}
            selected={!!activeSlug && activeSlug === template.slug}
            onPick={onPick}
          />
        ))}
        {!list.length && (
          <p className="col-span-full py-6 text-center text-[12.5px] text-muted">
            Nothing matches “{query}”
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

      <p className="hairline mt-3 flex items-center gap-1.5 pt-2.5 text-[12px] text-muted">
        <IconSpark size={10} /> templates via Imgflip · {MEME_TEMPLATES.length} included, no upload
      </p>
    </Panel>
  );
});

/* Hoisted so each tile has its own memo boundary — the grid holds a couple hundred of them. */
const TemplateTile = memo(function TemplateTile({
  template,
  eager,
  selected,
  onPick,
}: {
  template: { id: string; slug: string; name: string; boxes: number };
  eager: boolean;
  selected: boolean;
  onPick: (slug: string, name: string, boxes: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(template.slug, template.name, template.boxes)}
      title={template.name}
      aria-pressed={selected}
      className={`tile group block text-left ${selected ? "shadow-[3px_3px_0_var(--color-shadow)]" : ""}`}
    >
      <span className="relative block bg-checker">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/memes/thumbs/${template.slug}.webp`}
          alt={template.name}
          width={240}
          height={240}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          className="aspect-square w-full object-cover opacity-90 transition duration-200 group-hover:opacity-100"
        />
        {selected && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full border-2 border-ink bg-accent text-ink shadow-[1.5px_1.5px_0_var(--color-shadow)]"
          >
            <IconCheck size={10} />
          </span>
        )}
      </span>
      <span className={`tile-foot w-full${selected ? " bg-butter" : ""}`}>
        <span className="min-w-0 truncate">{template.name}</span>
      </span>
    </button>
  );
});
