/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SELECTION,
  GROUPS,
  PRESETS,
  type FitMode,
  type Preset,
} from "@/lib/presets";
import { extensionOf, formatBytes, slug } from "@/lib/format";
import { makeZip, saveBlob } from "@/lib/zip";

type Result = { presetId: string; blob: Blob; url: string; w: number; h: number };

type Item = {
  id: string;
  file: File;
  name: string;
  thumb: string;
  rev: number;
  status: "working" | "done" | "error";
  error?: string;
  focus?: { x: number; y: number };
  results: Record<string, Result>;
};

type Settings = {
  selected: string[];
  format: "jpeg" | "png";
  fit: FitMode;
  quality: number;
  background: string;
};

const INITIAL: Settings = {
  selected: DEFAULT_SELECTION,
  format: "jpeg",
  fit: "crop",
  quality: 0.9,
  background: "#0b0c0e",
};

function activePresets(settings: Settings): Preset[] {
  return PRESETS.filter((p) => settings.selected.includes(p.id));
}

export default function SizeKit() {
  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);

  const settingsRef = useRef(settings);
  const itemsRef = useRef<Item[]>([]);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const runningRef = useRef(false);
  const workersRef = useRef(new Map<string, () => void>());
  const rerunTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useInViewFade();

  function commit(next: Item[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function update(fn: (prev: Item[]) => Item[]) {
    commit(fn(itemsRef.current));
  }

  function revokeResults(item: Item) {
    for (const result of Object.values(item.results)) URL.revokeObjectURL(result.url);
  }

  async function drain() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length) {
        const task = queueRef.current.shift();
        if (task) await task();
      }
    } finally {
      runningRef.current = false;
    }
  }

  function enqueue(task: () => Promise<void>) {
    queueRef.current.push(task);
    void drain();
  }

  function runJob(
    itemId: string,
    file: File,
    rev: number,
    presets: Preset[],
    config: Settings,
    focus?: { x: number; y: number }
  ) {
    return new Promise<void>((resolve) => {
      // The item may have been removed or restarted while this task waited in the queue.
      if (!itemsRef.current.some((item) => item.id === itemId && item.rev === rev)) {
        resolve();
        return;
      }

      const worker = new Worker("/resize.worker.js");
      const jobId = `${itemId}:${rev}`;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        worker.terminate();
        workersRef.current.delete(itemId);
        resolve();
      };

      workersRef.current.set(itemId, finish);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as {
          type: string;
          jobId: string;
          presetId?: string;
          blob?: Blob;
          w?: number;
          h?: number;
          message?: string;
        };
        if (!data || data.jobId !== jobId) return;

        if (data.type === "result" && data.presetId && data.blob) {
          const url = URL.createObjectURL(data.blob);
          update((prev) =>
            prev.map((item) =>
              item.id === itemId && item.rev === rev
                ? {
                    ...item,
                    results: {
                      ...item.results,
                      [data.presetId as string]: {
                        presetId: data.presetId as string,
                        blob: data.blob as Blob,
                        url,
                        w: data.w ?? 0,
                        h: data.h ?? 0,
                      },
                    },
                  }
                : item
            )
          );
        } else if (data.type === "error") {
          update((prev) =>
            prev.map((item) =>
              item.id === itemId && item.rev === rev
                ? { ...item, status: "error", error: data.message ?? "Render failed" }
                : item
            )
          );
          finish();
        } else if (data.type === "done") {
          update((prev) =>
            prev.map((item) =>
              item.id === itemId && item.rev === rev ? { ...item, status: "done" } : item
            )
          );
          finish();
        }
      };

      worker.onerror = () => {
        update((prev) =>
          prev.map((item) =>
            item.id === itemId && item.rev === rev
              ? { ...item, status: "error", error: "This browser could not decode the file" }
              : item
          )
        );
        finish();
      };

      worker.postMessage({
        jobId,
        file,
        presets: presets.map((preset) => ({
          id: preset.id,
          w: preset.w,
          h: preset.h,
          fit: config.fit,
          format: preset.format ?? config.format,
        })),
        options: { quality: config.quality, background: config.background, focus },
      });
    });
  }

  function addFiles(input: FileList | File[]) {
    const files = Array.from(input).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;

    const presets = activePresets(settingsRef.current);
    const added: Item[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      thumb: URL.createObjectURL(file),
      rev: 1,
      status: "working",
      results: {},
    }));

    commit([...itemsRef.current, ...added]);
    for (const item of added) {
      enqueue(() => runJob(item.id, item.file, item.rev, presets, settingsRef.current));
    }
  }

  function setFocus(id: string, focus?: { x: number; y: number }) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;

    workersRef.current.get(id)?.();
    revokeResults(item);

    const rev = item.rev + 1;
    const next: Item = { ...item, focus, rev, status: "working", results: {}, error: undefined };
    commit(itemsRef.current.map((entry) => (entry.id === id ? next : entry)));

    const presets = activePresets(settingsRef.current);
    enqueue(() => runJob(id, item.file, rev, presets, settingsRef.current, focus));
  }

  function rerunAll() {
    const prev = itemsRef.current;
    if (!prev.length) return;

    const next = prev.map((item) => {
      revokeResults(item);
      return { ...item, rev: item.rev + 1, status: "working" as const, results: {}, error: undefined };
    });
    commit(next);

    const presets = activePresets(settingsRef.current);
    for (const item of next) {
      enqueue(() => runJob(item.id, item.file, item.rev, presets, settingsRef.current, item.focus));
    }
  }

  function patchSettings(patch: Partial<Settings>) {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);

    if (rerunTimer.current) window.clearTimeout(rerunTimer.current);
    rerunTimer.current = window.setTimeout(rerunAll, 200);
  }

  function togglePreset(id: string) {
    const selected = settingsRef.current.selected;
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    if (!next.length) return;
    patchSettings({ selected: next });
  }

  function removeItem(id: string) {
    workersRef.current.get(id)?.();
    workersRef.current.delete(id);
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (item) {
      revokeResults(item);
      URL.revokeObjectURL(item.thumb);
    }
    commit(itemsRef.current.filter((entry) => entry.id !== id));
  }

  function reset() {
    if (rerunTimer.current) window.clearTimeout(rerunTimer.current);
    for (const finish of workersRef.current.values()) finish();
    workersRef.current.clear();
    queueRef.current = [];
    for (const item of itemsRef.current) {
      revokeResults(item);
      URL.revokeObjectURL(item.thumb);
    }
    commit([]);
  }

  function downloadOne(item: Item, result: Result) {
    saveBlob(result.blob, `${slug(item.name)}-${result.presetId}-${result.w}x${result.h}.${extensionOf(result.blob)}`);
  }

  async function downloadAll() {
    const list = itemsRef.current.filter((item) => Object.keys(item.results).length > 0);
    if (!list.length || zipping) return;

    setZipping(true);
    try {
      const zip: Record<string, Uint8Array> = {};
      const multiple = list.length > 1;
      for (const item of list) {
        const folder = multiple ? `${slug(item.name)}/` : "";
        for (const result of Object.values(item.results)) {
          zip[`${folder}${result.presetId}-${result.w}x${result.h}.${extensionOf(result.blob)}`] =
            new Uint8Array(await result.blob.arrayBuffer());
        }
      }
      const blob = await makeZip(zip);
      saveBlob(blob, multiple ? "sizekit-batch.zip" : `sizekit-${slug(list[0].name)}.zip`);
    } finally {
      setZipping(false);
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPresets = PRESETS.filter((preset) => settings.selected.includes(preset.id));
  const finished = items.flatMap((item) => Object.values(item.results));
  const totalBytes = finished.reduce((sum, result) => sum + result.blob.size, 0);
  const totalExpected = selectedPresets.length * items.length;

  return (
    <div className="w-full">
      {items.length === 0 ? (
        <Dropzone
          dragging={dragging}
          onOpen={() => inputRef.current?.click()}
          onDrop={(files) => addFiles(files)}
          onDragState={setDragging}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="font-mono text-[11px] tracking-wide text-zinc-500">
            {items.length} image{items.length > 1 ? "s" : ""} · {finished.length}/{totalExpected} sizes
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition hover:border-zinc-600 hover:text-white"
            >
              + add
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-transparent px-2.5 py-1.5 font-mono text-[11px] text-zinc-500 transition hover:text-zinc-200"
            >
              clear
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {items.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-[272px_minmax(0,1fr)]">
          <aside className="order-2 md:order-1 md:sticky md:top-6 md:self-start">
            <div className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Sizes
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patchSettings({ selected: PRESETS.map((p) => p.id) })}
                    className="font-mono text-[10px] text-zinc-500 transition hover:text-acid"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    onClick={() => patchSettings({ selected: DEFAULT_SELECTION })}
                    className="font-mono text-[10px] text-zinc-500 transition hover:text-acid"
                  >
                    reset
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESETS.filter((preset) => preset.group === group.id).map((preset) => {
                        const on = settings.selected.includes(preset.id);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => togglePreset(preset.id)}
                            title={`${preset.label} · ${preset.w}×${preset.h}`}
                            className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                              on
                                ? "border-acid/40 bg-acid/10 text-acid"
                                : "border-line text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4 border-t border-line pt-4">
                <div>
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                    Fit
                  </p>
                  <Segmented
                    options={[
                      { value: "crop", label: "Smart crop" },
                      { value: "pad", label: "Pad" },
                    ]}
                    value={settings.fit}
                    onChange={(value) => patchSettings({ fit: value as FitMode })}
                  />
                  <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
                    {settings.fit === "crop"
                      ? "Finds the busiest part of the photo so faces stay in frame."
                      : "Keeps the whole photo and fills the edges with a color."}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-700">
                    Cut-outs with transparency are fitted, never cropped.
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                    Format
                  </p>
                  <Segmented
                    options={[
                      { value: "jpeg", label: "JPEG" },
                      { value: "png", label: "PNG" },
                    ]}
                    value={settings.format}
                    onChange={(value) => patchSettings({ format: value as "jpeg" | "png" })}
                  />
                  <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
                    Icons always export as PNG.
                  </p>
                </div>

                {settings.format === "jpeg" && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Quality
                      </p>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {Math.round(settings.quality * 100)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1}
                      step={0.02}
                      value={settings.quality}
                      onChange={(event) => patchSettings({ quality: Number(event.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}

                {settings.fit === "pad" && (
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      Padding
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500">
                        {settings.background}
                      </span>
                      <input
                        type="color"
                        value={settings.background}
                        onChange={(event) => patchSettings({ background: event.target.value })}
                        className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={!finished.length || zipping}
                  className="w-full rounded-lg bg-acid px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-zinc-500"
                >
                  {zipping
                    ? "Packing…"
                    : `Download all ${finished.length ? `· ${formatBytes(totalBytes)}` : ""}`}
                </button>
                <p className="text-center font-mono text-[10px] text-zinc-600">
                  ZIP · stored, not re-compressed
                </p>
              </div>
            </div>
          </aside>

          <section className="order-1 min-w-0 space-y-4 md:order-2">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                presets={selectedPresets}
                onDownload={downloadOne}
                onRemove={removeItem}
                onFocus={setFocus}
              />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Dropzone({
  dragging,
  onOpen,
  onDrop,
  onDragState,
}: {
  dragging: boolean;
  onOpen: () => void;
  onDrop: (files: FileList | File[]) => void;
  onDragState: (value: boolean) => void;
}) {
  return (
    <div
      onClick={onOpen}
      onDragOver={(event) => {
        event.preventDefault();
        onDragState(true);
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(event) => {
        event.preventDefault();
        onDragState(false);
        onDrop(event.dataTransfer.files);
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-dashed px-6 py-14 text-center transition sm:py-20 ${
        dragging ? "border-acid/70 bg-acid/[0.04]" : "border-line bg-panel hover:border-zinc-600"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 glow" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-ink text-acid">
          <UploadIcon />
        </div>
        <p className="text-[15px] font-medium text-zinc-200">
          Drop an image, or click to browse
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
          JPG · PNG · WebP · AVIF — or just paste with ⌘V
          <br />
          <span className="text-zinc-600">Nothing is uploaded. Everything runs in this tab.</span>
        </p>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  presets,
  onDownload,
  onRemove,
  onFocus,
}: {
  item: Item;
  presets: Preset[];
  onDownload: (item: Item, result: Result) => void;
  onRemove: (id: string) => void;
  onFocus: (id: string, focus?: { x: number; y: number }) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const results = Object.values(item.results);
  const done = results.length >= presets.length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <div className="size-8 shrink-0 overflow-hidden rounded-md border border-line bg-checker">
          <img src={item.thumb} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-zinc-300">{item.name}</p>
          <p className="font-mono text-[10px] text-zinc-600">
            {formatBytes(item.file.size)} in · {results.length}/{presets.length} out
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdjusting((value) => !value)}
          className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
            adjusting || item.focus
              ? "border-acid/40 text-acid"
              : "border-line text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
          }`}
        >
          {item.focus ? "focused" : "crop"}
        </button>
        <span
          className={`font-mono text-[10px] ${
            item.status === "error" ? "text-red-400" : done ? "text-acid" : "text-zinc-500"
          }`}
        >
          {item.status === "error" ? "failed" : done ? "ready" : "rendering"}
        </span>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove image"
          className="rounded p-1 text-zinc-600 transition hover:bg-line hover:text-zinc-300"
        >
          <CloseIcon />
        </button>
      </div>

      {adjusting && (
        <div className="border-b border-line p-2.5">
          <div className="relative overflow-hidden rounded-lg border border-line">
            <img
              src={item.thumb}
              alt="Pick a focal point"
              draggable={false}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onFocus(item.id, {
                  x: (event.clientX - rect.left) / rect.width,
                  y: (event.clientY - rect.top) / rect.height,
                });
              }}
              className="block w-full cursor-crosshair select-none"
            />
            {item.focus && (
              <span
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-acid bg-ink/50 shadow-[0_0_0_6px_rgba(216,255,62,0.15)]"
                style={{ left: `${item.focus.x * 100}%`, top: `${item.focus.y * 100}%` }}
              />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] text-zinc-600">
              click where the subject is — every size re-crops around it
            </p>
            <button
              type="button"
              onClick={() => onFocus(item.id)}
              disabled={!item.focus}
              className="shrink-0 font-mono text-[10px] text-zinc-500 transition hover:text-acid disabled:text-zinc-700"
            >
              auto
            </button>
          </div>
        </div>
      )}

      {item.error ? (
        <p className="px-3 py-4 text-[12px] text-red-300/90">{item.error} — try a JPG or PNG.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {presets.map((preset) => {
            const result = item.results[preset.id];
            return (
              <div
                key={preset.id}
                className="group relative overflow-hidden rounded-lg border border-line bg-ink"
              >
                <div className="relative bg-ink" style={{ height: 118 }}>
                  {result ? (
                    <img
                      src={result.url}
                      alt={preset.label}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="size-2 animate-pulse rounded-full bg-acid/50" />
                    </div>
                  )}
                  {result && (
                    <button
                      type="button"
                      onClick={() => onDownload(item, result)}
                      aria-label={`Download ${preset.label}`}
                      className="absolute right-1.5 top-1.5 rounded-md border border-white/10 bg-ink/80 p-1.5 text-zinc-300 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-acid"
                    >
                      <DownloadIcon />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5">
                  <span className="truncate font-mono text-[10px] text-zinc-500">
                    {preset.w}×{preset.h}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                    {result ? formatBytes(result.blob.size) : "…"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex w-fit rounded-md border border-line p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1 font-mono text-[10px] transition ${
            value === option.value
              ? "bg-line text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Tiny scroll reveal, no dependencies. */
function useInViewFade() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "-8% 0px" }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
