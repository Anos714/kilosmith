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
  Slider,
  StatusTag,
} from "@/components/ui";
import {
  IconCheck,
  IconClose,
  IconDownload,
  IconRedo,
  IconSpark,
  IconUndo,
  IconUpload,
} from "@/components/icons";
import { decodeImage, supportsFormat, toBlob as encodeCanvas } from "@/lib/image";
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
  type Stroke,
  type StrokeTool,
  type Sticker,
} from "@/lib/meme";

const MAX_EDGE = 2000;
const MAX_BOXES = 6;
const MAX_STICKERS = 12;
/** Rapid edits of the same field collapse into one undo step. */
const BURST_MS = 1500;
const HISTORY_LIMIT = 60;
const DEFAULT_INK = "#ff3366";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

/** Does this document still hold the thing `activeId` points at? */
function existsIn(candidate: MemeDoc, id: string) {
  return (
    candidate.texts.some((item) => item.id === id) ||
    candidate.strokes.some((item) => item.id === id) ||
    candidate.stickers.some((item) => item.id === id)
  );
}

type Tool = StrokeTool | "move";

const TOOLS: { value: Tool; label: string }[] = [
  { value: "move", label: "Move" },
  { value: "pen", label: "Pen" },
  { value: "marker", label: "Marker" },
  { value: "box", label: "Box" },
  { value: "arrow", label: "Arrow" },
];

const STROKE_LABELS: Record<StrokeTool, string> = {
  pen: "Pen",
  marker: "Marker",
  box: "Box",
  arrow: "Arrow",
};

const EMOJI = [
  "😂", "🤣", "😭", "🥺", "😳", "🤯", "😎", "🤔",
  "🙃", "😴", "🥶", "🤠", "👻", "💀", "🔥", "✨",
  "💯", "🎉", "👏", "🙌", "💪", "🤝", "👀", "🫠",
  "🤌", "💩", "🍕", "🍔", "☕", "🌈", "⭐", "⚡",
];

/** Everything the canvas paints — and everything history snapshots. */
type MemeDoc = { texts: MemeText[]; strokes: Stroke[]; stickers: Sticker[] };

type Picture = {
  bitmap: ImageBitmap;
  name: string;
  slug: string | null;
};

type Note = { tone: "done" | "error"; text: string };
type Task = "png" | "jpg" | "webp" | "copy";

type DragState =
  | { kind: "draw"; id: string; strokeTool: StrokeTool; sx: number; sy: number }
  | { kind: "text"; id: string; dx: number; dy: number }
  | { kind: "sticker"; id: string; dx: number; dy: number }
  | { kind: "stroke"; id: string; origin: number[]; sx: number; sy: number };

export default function MemeTool() {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [doc, setDoc] = useState<MemeDoc>(() => ({ texts: defaultTexts(2), strokes: [], stickers: [] }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [ink, setInk] = useState(DEFAULT_INK);
  const [strokeWidth, setStrokeWidth] = useState(14);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [background, setBackground] = useState("#0b0d10");
  const [note, setNote] = useState<Note | null>(null);
  const [working, setWorking] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canWebp, setCanWebp] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectsRef = useRef<BoxRect[]>([]);
  const dragRef = useRef<DragState | null>(null);
  // Mirror of `picture` so the previous bitmap can be closed on replace and unmount.
  const pictureRef = useRef<Picture | null>(null);
  // Only the newest load may commit state; older decodes get closed and dropped.
  const loadId = useRef(0);

  // History lives in refs: snapshots are big and never drive rendering on
  // their own. Only the undo/redo availability is mirrored into state, since
  // the panel must re-render when it flips.
  const docRef = useRef<MemeDoc>(doc);
  const historyRef = useRef<{ past: MemeDoc[]; future: MemeDoc[] }>({ past: [], future: [] });
  const burstRef = useRef<{ key: string; at: number } | null>(null);
  // Set for the length of one gesture (a drag or a stroke), so every pointer
  // move inside it stays out of history and lands as a single undo step.
  const pendingRef = useRef<MemeDoc | null>(null);

  const syncHistory = useCallback(() => {
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(historyRef.current.future.length > 0);
  }, []);

  /** Swap the whole document and forget the past — a new image is a new world. */
  const replaceDoc = useCallback(
    (next: MemeDoc) => {
      docRef.current = next;
      historyRef.current.past.length = 0;
      historyRef.current.future.length = 0;
      burstRef.current = null;
      pendingRef.current = null;
      setDoc(next);
      syncHistory();
    },
    [syncHistory]
  );

  const commit = useCallback(
    (update: (current: MemeDoc) => MemeDoc, key?: string) => {
      const current = docRef.current;
      const next = update(current);
      if (next === current) return;
      docRef.current = next;

      // Inside a gesture the snapshot taken at pointerdown is the undo step;
      // pushing every intermediate frame would bury it.
      if (!pendingRef.current) {
        const now = Date.now();
        const burst = burstRef.current;
        const coalesce = !!key && !!burst && burst.key === key && now - burst.at < BURST_MS;
        if (!coalesce) {
          const past = historyRef.current.past;
          past.push(current);
          if (past.length > HISTORY_LIMIT) past.shift();
          historyRef.current.future.length = 0;
        }
        burstRef.current = key ? { key, at: now } : null;
        syncHistory();
      }
      setDoc(next);
    },
    [syncHistory]
  );

  const beginGesture = useCallback(() => {
    if (!pendingRef.current) pendingRef.current = docRef.current;
  }, []);

  const endGesture = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && pending !== docRef.current) {
      const past = historyRef.current.past;
      past.push(pending);
      if (past.length > HISTORY_LIMIT) past.shift();
      historyRef.current.future.length = 0;
      burstRef.current = null;
      syncHistory();
    }
  }, [syncHistory]);

  /** Throw the gesture away without an undo step — a click that made no mark. */
  const cancelGesture = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      docRef.current = pending;
      setDoc(pending);
    }
  }, []);

  const undo = useCallback(() => {
    if (pendingRef.current) return;
    const { past, future } = historyRef.current;
    const previous = past.pop();
    if (!previous) return;
    future.push(docRef.current);
    docRef.current = previous;
    burstRef.current = null;
    // The selection may have pointed at something the old world lacks.
    if (activeId && !existsIn(previous, activeId)) setActiveId(null);
    setDoc(previous);
    syncHistory();
  }, [activeId, syncHistory]);

  const redo = useCallback(() => {
    if (pendingRef.current) return;
    const { past, future } = historyRef.current;
    const next = future.pop();
    if (!next) return;
    past.push(docRef.current);
    docRef.current = next;
    burstRef.current = null;
    if (activeId && !existsIn(next, activeId)) setActiveId(null);
    setDoc(next);
    syncHistory();
  }, [activeId, syncHistory]);

  const removeActive = useCallback(() => {
    const id = activeId;
    if (!id) return;
    commit((current) => {
      if (current.texts.some((item) => item.id === id)) {
        // One caption is the floor — the panel's own delete button agrees.
        if (current.texts.length <= 1) return current;
        return { ...current, texts: current.texts.filter((item) => item.id !== id) };
      }
      if (current.stickers.some((item) => item.id === id))
        return { ...current, stickers: current.stickers.filter((item) => item.id !== id) };
      if (current.strokes.some((item) => item.id === id))
        return { ...current, strokes: current.strokes.filter((item) => item.id !== id) };
      return current;
    });
    setActiveId(null);
  }, [activeId, commit]);

  // Deriving the active caption keeps the panel valid after a delete without
  // scheduling a state update from an effect. Falls back to the first caption
  // only while nothing is selected at all.
  const activeText = activeId
    ? doc.texts.find((item) => item.id === activeId) ?? null
    : doc.texts[0] ?? null;
  const activeStroke = activeId ? doc.strokes.find((item) => item.id === activeId) ?? null : null;
  const activeSticker = activeId ? doc.stickers.find((item) => item.id === activeId) ?? null : null;

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
      texts: doc.texts,
      strokes: doc.strokes,
      stickers: doc.stickers,
      activeId,
      guides: true,
    });
  }, [picture, doc, fit, background, activeId]);

  // The tool stays mounted across a browsing session; when it finally unmounts,
  // hand the live bitmap back to the browser.
  useEffect(
    () => () => {
      pictureRef.current?.bitmap.close();
      pictureRef.current = null;
    },
    []
  );

  // Browsers differ on WebP encoding through canvas; ask once and hide the
  // button where the answer is no rather than silently saving a PNG.
  useEffect(() => {
    void supportsFormat("webp").then(setCanWebp);
  }, []);

  const adopt = useCallback(
    (next: Picture, boxes: number) => {
      const previous = pictureRef.current;
      if (previous && previous !== next) previous.bitmap.close();
      pictureRef.current = next;
      const captions = defaultTexts(boxes);
      setPicture(next);
      replaceDoc({ texts: captions, strokes: [], stickers: [] });
      setActiveId(captions[0]?.id ?? null);
      setNote(null);
    },
    [replaceDoc]
  );

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
        adopt({ bitmap, name: file.name.replace(/\.[a-z0-9]+$/i, ""), slug: null }, docRef.current.texts.length || 2);
      } catch {
        if (id === loadId.current)
          setNote({ tone: "error", text: "That file could not be decoded as an image." });
      } finally {
        if (id === loadId.current) setWorking(false);
      }
    },
    [adopt]
  );

  function startOver() {
    loadId.current++; // a late decode from an in-flight load closes itself instead of adopting
    pictureRef.current?.bitmap.close();
    pictureRef.current = null;
    setWorking(false);
    setNote(null);
    setPicture(null);
    replaceDoc({ texts: defaultTexts(2), strokes: [], stickers: [] });
    setActiveId(null);
  }

  async function renderBlob(format: "png" | "jpeg" | "webp"): Promise<Blob | null> {
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
      texts: doc.texts,
      strokes: doc.strokes,
      stickers: doc.stickers,
      guides: false,
    });
    return encodeCanvas(offscreen, format, 0.92);
  }

  async function download(format: "png" | "jpeg" | "webp") {
    setTask(format === "png" ? "png" : format === "webp" ? "webp" : "jpg");
    try {
      const blob = await renderBlob(format);
      if (!blob) throw new Error("This browser would not encode the image.");
      const extension = format === "jpeg" ? "jpg" : format;
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
      const blob = await renderBlob("png");
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

  /* --------------------------------- editing -------------------------------- */

  function patch(id: string, changes: Partial<MemeText>, key?: string) {
    commit(
      (current) => ({
        ...current,
        texts: current.texts.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      }),
      key && `${key}:${id}`
    );
  }

  function patchStroke(id: string, changes: Partial<Stroke>) {
    commit(
      (current) => ({
        ...current,
        strokes: current.strokes.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      }),
      `stroke:${id}`
    );
  }

  function addText() {
    if (doc.texts.length >= MAX_BOXES) return;
    const item = newText(doc.texts);
    commit((current) => ({ ...current, texts: [...current.texts, item] }));
    setActiveId(item.id);
  }

  function addSticker(char: string) {
    if (activeSticker) {
      // A selected sticker is the target: tapping an emoji swaps it in place.
      commit(
        (current) => ({
          ...current,
          stickers: current.stickers.map((item) =>
            item.id === activeSticker.id ? { ...item, char } : item
          ),
        }),
        `sticker-swap:${activeSticker.id}`
      );
      return;
    }
    if (doc.stickers.length >= MAX_STICKERS) return;
    const sticker: Sticker = { id: crypto.randomUUID(), char, x: 0.5, y: 0.5, size: 0.12 };
    commit((current) => ({ ...current, stickers: [...current.stickers, sticker] }));
    setActiveId(sticker.id);
  }

  /* -------------------------------- keyboard -------------------------------- */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = document.getElementById("panel-meme");
      if (!panel || panel.hidden || !picture) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      // The caption box is a field too, but undo should still reach it.
      const inCaption = !!target?.closest?.('[aria-label="Caption text"]');
      const mod = event.ctrlKey || event.metaKey;

      if (mod && (event.key === "z" || event.key === "Z")) {
        if (inField && !inCaption) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (event.key === "y" || event.key === "Y")) {
        if (inField && !inCaption) return;
        event.preventDefault();
        redo();
        return;
      }
      // Never steal Delete from a field — inside the caption it must edit text.
      if ((event.key === "Delete" || event.key === "Backspace") && !inField && activeId) {
        event.preventDefault();
        removeActive();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picture, activeId, undo, redo, removeActive]);

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

  function capture(event: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety; dragging still works without it.
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!picture) return;
    const point = pointOf(event);
    const nx = point.x / point.width;
    const ny = point.y / point.height;

    if (tool === "move") {
      // Rects come back bottom-to-top, so a reversed scan finds the top mark.
      const hit = [...rectsRef.current].reverse().find(
        (rect) =>
          point.x >= rect.x - 12 &&
          point.x <= rect.x + rect.w + 12 &&
          point.y >= rect.y - 10 &&
          point.y <= rect.y + rect.h + 10
      );
      if (!hit) {
        setActiveId(null);
        return;
      }
      const sticker = docRef.current.stickers.find((item) => item.id === hit.id);
      const stroke = docRef.current.strokes.find((item) => item.id === hit.id);
      const text = docRef.current.texts.find((item) => item.id === hit.id);
      if (!sticker && !stroke && !text) return;

      setActiveId(hit.id);
      beginGesture();
      if (sticker) {
        dragRef.current = {
          kind: "sticker",
          id: sticker.id,
          dx: point.x - sticker.x * point.width,
          dy: point.y - sticker.y * point.height,
        };
      } else if (stroke) {
        dragRef.current = {
          kind: "stroke",
          id: stroke.id,
          origin: [...stroke.points],
          sx: nx,
          sy: ny,
        };
      } else if (text) {
        dragRef.current = {
          kind: "text",
          id: text.id,
          dx: point.x - text.x * point.width,
          dy: point.y - text.y * point.height,
        };
      }
      capture(event);
      event.preventDefault();
      return;
    }

    // Drawing: the whole stroke is one gesture, one undo step.
    const strokeTool = tool as StrokeTool;
    const id = crypto.randomUUID();
    beginGesture();
    commit((current) => ({
      ...current,
      strokes: [
        ...current.strokes,
        { id, tool: strokeTool, color: ink, width: strokeWidth, points: [nx, ny, nx, ny] },
      ],
    }));
    dragRef.current = { kind: "draw", id, strokeTool, sx: nx, sy: ny };
    capture(event);
    event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointOf(event);
    const nx = point.x / point.width;
    const ny = point.y / point.height;

    if (drag.kind === "draw") {
      if (drag.strokeTool === "pen" || drag.strokeTool === "marker") {
        commit((current) => ({
          ...current,
          strokes: current.strokes.map((item) => {
            if (item.id !== drag.id) return item;
            const lastX = item.points[item.points.length - 2];
            const lastY = item.points[item.points.length - 1];
            // Skip near-duplicates so a slow hand doesn't balloon the history.
            if (Math.hypot(nx - lastX, ny - lastY) < 0.004) return item;
            return { ...item, points: [...item.points, nx, ny] };
          }),
        }));
      } else {
        commit((current) => ({
          ...current,
          strokes: current.strokes.map((item) =>
            item.id === drag.id ? { ...item, points: [item.points[0], item.points[1], nx, ny] } : item
          ),
        }));
      }
      return;
    }

    if (drag.kind === "stroke") {
      const dx = nx - drag.sx;
      const dy = ny - drag.sy;
      commit((current) => ({
        ...current,
        strokes: current.strokes.map((item) =>
          item.id === drag.id
            ? { ...item, points: drag.origin.map((value, i) => clamp01(value + (i % 2 === 0 ? dx : dy))) }
            : item
        ),
      }));
      return;
    }

    if (drag.kind === "sticker") {
      const rect = rectsRef.current.find((entry) => entry.id === drag.id);
      const halfW = rect ? rect.w / point.width / 2 : 0.05;
      const halfH = rect ? rect.h / point.height / 2 : 0.06;
      const x = clamp((point.x - drag.dx) / point.width, Math.min(0.5, halfW), Math.max(0.5, 1 - halfW));
      const y = clamp((point.y - drag.dy) / point.height, Math.min(0.5, halfH), Math.max(0.5, 1 - halfH));
      commit((current) => ({
        ...current,
        stickers: current.stickers.map((item) => (item.id === drag.id ? { ...item, x, y } : item)),
      }));
      return;
    }

    const rect = rectsRef.current.find((entry) => entry.id === drag.id);
    const item = docRef.current.texts.find((entry) => entry.id === drag.id);
    if (!item) return;

    // Keep most of the block on the canvas, but let a wide caption still slide
    // a little instead of freezing at the centre.
    const half = (rect?.w ?? 0) / point.width / 2;
    const margin = Math.min(half * 0.55, 0.42);
    const x = Math.min(1 - margin, Math.max(margin, (point.x - drag.dx) / point.width));
    let y = (point.y - drag.dy) / point.height;

    // Keep the caption on the canvas: the anchor can sit anywhere inside it as
    // long as the whole block still fits.
    const span = (rect?.h ?? 0) / point.height;
    if (item.anchor === "top") y = Math.min(y, 1 - span - 0.01);
    else if (item.anchor === "bottom") y = Math.max(y, span + 0.01);
    else y = Math.min(1 - span / 2 - 0.01, Math.max(span / 2 + 0.01, y));

    patch(drag.id, { x, y: Math.min(1, Math.max(0, y)) });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    if (drag.kind === "draw" && (drag.strokeTool === "box" || drag.strokeTool === "arrow")) {
      const stroke = docRef.current.strokes.find((item) => item.id === drag.id);
      if (stroke) {
        const [x0, y0, x1, y1] = stroke.points;
        const distance = Math.hypot((x1 - x0) * event.currentTarget.width, (y1 - y0) * event.currentTarget.height);
        // A click with no drag made no shape — don't leave a junk undo step.
        if (distance < 8) {
          cancelGesture();
          return;
        }
      }
    }
    endGesture();
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
      <Panel className="order-2 self-start p-4 md:sticky md:top-20 md:order-1 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
            Captions{" "}
            <span className="text-[12px] font-normal tabular-nums text-muted">
              {doc.texts.length}/{MAX_BOXES}
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <IconButton
              onClick={undo}
              label="Undo"
              disabled={!canUndo}
              className="size-7 disabled:opacity-40"
            >
              <IconUndo size={12} />
            </IconButton>
            <IconButton
              onClick={redo}
              label="Redo"
              disabled={!canRedo}
              className="size-7 disabled:opacity-40"
            >
              <IconRedo size={12} />
            </IconButton>
            <MiniButton
              onClick={addText}
              disabled={doc.texts.length >= MAX_BOXES}
              title={doc.texts.length >= MAX_BOXES ? "Six is plenty" : "Add another caption"}
            >
              + add text
            </MiniButton>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {doc.texts.map((item, index) => (
            <Chip
              key={item.id}
              active={item.id === activeText?.id}
              onClick={() => setActiveId(item.id)}
              title={item.text.trim() || undefined}
            >
              <span className="block max-w-[9rem] truncate">
                {item.text.trim() ? item.text.trim().slice(0, 14) : `text ${index + 1}`}
              </span>
            </Chip>
          ))}
        </div>

        {activeText && (
          <div className="mt-4 space-y-4">
            <div>
              <textarea
                key={activeText.id}
                value={activeText.text}
                onChange={(event) =>
                  patch(activeText.id, { text: event.target.value }, `text`)
                }
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
                    checked={activeText.auto}
                    onChange={(event) =>
                      patch(activeText.id, { auto: event.target.checked }, `auto`)
                    }
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  Auto size
                </label>
                <span className="font-[family-name:var(--font-display)] text-[13px] tabular-nums text-ink-2">
                  {activeText.auto ? "fits itself" : `${Math.round(activeText.size * 100)}%`}
                </span>
              </div>

              <input
                type="range"
                min={4}
                max={30}
                step={1}
                value={Math.round(activeText.size * 100)}
                disabled={activeText.auto}
                onChange={(event) => {
                  const pct = Number(event.target.value);
                  if (Number.isFinite(pct))
                    patch(activeText.id, { size: Math.min(30, Math.max(4, pct)) / 100 }, `size`);
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
                value={activeText.font}
                onChange={(value) => patch(activeText.id, { font: value }, `font`)}
              />
            </Field>

            <Field label="Case">
              <Segmented
                options={[
                  { value: "upper", label: "UPPER" },
                  { value: "normal", label: "Normal" },
                ]}
                value={activeText.upper ? "upper" : "normal"}
                onChange={(value) => patch(activeText.id, { upper: value === "upper" }, `case`)}
              />
            </Field>

            <div>
              <Slider
                label="Tilt"
                min={-45}
                max={45}
                step={1}
                value={activeText.rotate}
                display={`${activeText.rotate}°`}
                onChange={(value) => patch(activeText.id, { rotate: value }, `rotate`)}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                Fill
              </p>
              <input
                type="color"
                value={activeText.color}
                onChange={(event) => patch(activeText.id, { color: event.target.value }, `color`)}
                className="h-8 w-12"
                aria-label="Text colour"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={activeText.outlineOn}
                  onChange={(event) =>
                    patch(activeText.id, { outlineOn: event.target.checked }, `outline`)
                  }
                  className="size-4 accent-[var(--color-accent)]"
                />
                Outline
              </label>
              <input
                type="color"
                value={activeText.outline}
                disabled={!activeText.outlineOn}
                onChange={(event) => patch(activeText.id, { outline: event.target.value }, `outline`)}
                className="h-8 w-12 disabled:opacity-40"
                aria-label="Outline colour"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={activeText.backingOn}
                  onChange={(event) =>
                    patch(activeText.id, { backingOn: event.target.checked }, `backing`)
                  }
                  className="size-4 accent-[var(--color-accent)]"
                />
                Highlight
              </label>
              <input
                type="color"
                value={activeText.backing}
                disabled={!activeText.backingOn}
                onChange={(event) => patch(activeText.id, { backing: event.target.value }, `backing`)}
                className="h-8 w-12 disabled:opacity-40"
                aria-label="Highlight colour"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-[family-name:var(--font-display)] text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={activeText.shadowOn}
                  onChange={(event) =>
                    patch(activeText.id, { shadowOn: event.target.checked }, `shadow`)
                  }
                  className="size-4 accent-[var(--color-accent)]"
                />
                Drop shadow
              </label>
              <input
                type="color"
                value={activeText.shadow}
                disabled={!activeText.shadowOn}
                onChange={(event) => patch(activeText.id, { shadow: event.target.value }, `shadow`)}
                className="h-8 w-12 disabled:opacity-40"
                aria-label="Shadow colour"
              />
            </div>

            {doc.texts.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] leading-snug text-muted">Every caption gets its own style.</p>
                <IconButton
                  onClick={() => removeActive()}
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

        <div className="mt-5 hairline pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
              Stickers{" "}
              <span className="text-[12px] font-normal tabular-nums text-muted">
                {doc.stickers.length}/{MAX_STICKERS}
              </span>
            </p>
            {activeSticker && (
              <IconButton
                onClick={() => removeActive()}
                label="Delete this sticker"
                className="size-7 bg-coral"
              >
                <IconClose size={11} />
              </IconButton>
            )}
          </div>

          <div className="mt-2 grid grid-cols-8 gap-1">
            {EMOJI.map((char) => (
              <button
                key={char}
                type="button"
                onClick={() => addSticker(char)}
                disabled={!activeSticker && doc.stickers.length >= MAX_STICKERS}
                title={activeSticker ? "Swap the selected sticker" : "Add this sticker"}
                className="rounded-lg border-2 border-ink/20 bg-card py-1 text-[17px] leading-none transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:shadow-[2px_2px_0_var(--color-shadow)] disabled:pointer-events-none disabled:opacity-40"
              >
                {char}
              </button>
            ))}
          </div>

          {activeSticker ? (
            <div className="mt-3">
              <Slider
                label="Sticker size"
                min={4}
                max={40}
                step={1}
                value={Math.round(activeSticker.size * 100)}
                display={`${Math.round(activeSticker.size * 100)}%`}
                onChange={(value) =>
                  commit(
                    (current) => ({
                      ...current,
                      stickers: current.stickers.map((item) =>
                        item.id === activeSticker.id ? { ...item, size: value / 100 } : item
                      ),
                    }),
                    `sticker-size:${activeSticker.id}`
                  )
                }
              />
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                Tap another emoji to swap this one, or drag it on the image.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] leading-snug text-muted">
              Tap an emoji to drop it on the image — drag to place, tap again to swap.
            </p>
          )}
        </div>

        {activeStroke && (
          <div className="mt-5 hairline pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                {STROKE_LABELS[activeStroke.tool]} stroke
              </p>
              <IconButton
                onClick={() => removeActive()}
                label="Delete this stroke"
                className="size-7 bg-coral"
              >
                <IconClose size={11} />
              </IconButton>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <input
                type="color"
                value={activeStroke.color}
                onChange={(event) => patchStroke(activeStroke.id, { color: event.target.value })}
                className="h-8 w-12 shrink-0"
                aria-label="Stroke colour"
              />
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={activeStroke.width}
                onChange={(event) => patchStroke(activeStroke.id, { width: Number(event.target.value) })}
                className="min-w-0 flex-1"
                aria-label="Stroke thickness"
              />
              <span className="w-12 shrink-0 text-right font-[family-name:var(--font-display)] text-[13px] tabular-nums text-ink-2">
                {activeStroke.width}px
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2 hairline pt-4">
          <Button onClick={() => download("png")} disabled={!!task || working}>
            <IconDownload size={14} /> PNG
          </Button>
          <Button variant="secondary" onClick={() => download("jpeg")} disabled={!!task || working}>
            JPG
          </Button>
          {canWebp && (
            <Button variant="secondary" onClick={() => download("webp")} disabled={!!task || working}>
              WebP
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={copy}
            disabled={!canCopy || !!task || working}
            className="col-span-full"
          >
            copy
          </Button>
        </div>
        {!canCopy && (
          <p className="mt-1.5 text-[12px] leading-snug text-muted">
            Copy is off — the clipboard needs https. PNG, JPG and WebP still work.
          </p>
        )}

        <MiniButton onClick={startOver} className="mt-3 w-full">
          change image
        </MiniButton>
      </Panel>

      <div className="order-1 min-w-0 space-y-4 md:order-2">
        <div className="space-y-2 rounded-2xl bg-paper-2 px-2.5 py-2">
          <Segmented options={TOOLS} value={tool} onChange={setTool} />
          {tool !== "move" && (
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={ink}
                onChange={(event) => setInk(event.target.value)}
                className="h-8 w-12 shrink-0"
                aria-label="Stroke colour"
              />
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
                className="min-w-0 flex-1"
                aria-label="Stroke width"
              />
              <span className="w-12 shrink-0 text-right font-[family-name:var(--font-display)] text-[13px] tabular-nums text-ink-2">
                {strokeWidth}px
              </span>
            </div>
          )}
        </div>

        {/* pop-sm rather than .tile: the hover tilt would skew the canvas pointer maths. */}
        <div className="pop-sm overflow-hidden">
          <div className="bg-checker p-3">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`mx-auto block max-h-[520px] w-auto max-w-full touch-none ${
                tool === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
              }`}
              aria-label="Meme preview"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <p className="font-[family-name:var(--font-display)] text-[13px] text-ink-2">{picture.name}</p>
          <span className="text-[12px] text-muted">
            {tool === "move"
              ? "· drag captions, stickers or strokes"
              : `· drawing with ${STROKE_LABELS[tool]}`}
          </span>
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
