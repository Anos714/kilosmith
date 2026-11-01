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
import { formatBytes, slug } from "@/lib/format";
import { makeZip, saveBlob, zipName } from "@/lib/zip";
import { FORMATS, extensionFor, supportsFormat, type OutFormat } from "@/lib/image";
import {
  Button,
  Chip,
  DropZone,
  IconButton,
  MiniButton,
  Slider,
  Segmented,
  StatusTag,
} from "@/components/ui";
import { IconClose, IconDownload } from "@/components/icons";

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
  format: OutFormat;
  fit: FitMode;
  quality: number;
  background: string;
};

const INITIAL: Settings = {
  selected: DEFAULT_SELECTION,
  format: "jpeg",
  fit: "crop",
  quality: 0.9,
  background: "#ffffff",
};

function activePresets(settings: Settings): Preset[] {
  return PRESETS.filter((p) => settings.selected.includes(p.id));
}

export default function ResizeTool() {
  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [items, setItems] = useState<Item[]>([]);
  const [zipping, setZipping] = useState(false);
  const [supported, setSupported] = useState<Record<string, boolean>>({});

  const settingsRef = useRef(settings);
  const itemsRef = useRef<Item[]>([]);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const runningRef = useRef(false);
  const workersRef = useRef(new Map<string, () => void>());
  const rerunTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(
    () => () => {
      if (rerunTimer.current) window.clearTimeout(rerunTimer.current);
    },
    []
  );

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
        // Only drop the handle if it is still ours — a newer job may have replaced it.
        if (workersRef.current.get(itemId) === finish) workersRef.current.delete(itemId);
        resolve();
      };

      workersRef.current.set(itemId, finish);

      /** True while this exact job still owns the item. */
      const isLive = () =>
        !settled && itemsRef.current.some((item) => item.id === itemId && item.rev === rev);

      const apply = (patch: (item: Item) => Item) => {
        update((prev) =>
          prev.map((item) => (item.id === itemId && item.rev === rev ? patch(item) : item))
        );
      };

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
          // A removed or restarted item gets no object URL — nothing would revoke it.
          if (!isLive()) return;
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
          apply((item) => ({ ...item, status: "error", error: data.message ?? "Render failed" }));
          finish();
        } else if (data.type === "done") {
          apply((item) => ({ ...item, status: "done" }));
          finish();
        }
      };

      worker.onerror = () => {
        apply((item) => ({
          ...item,
          status: "error",
          error: "This browser could not decode the file",
        }));
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
        options: {
          quality: Math.min(1, Math.max(0.1, config.quality)),
          background: config.background,
          focus,
        },
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
    saveBlob(
      result.blob,
      `${slug(item.name)}-${result.presetId}-${result.w}x${result.h}.${extensionFor(result.blob)}`
    );
  }

  async function downloadAll() {
    const list = itemsRef.current.filter((item) => Object.keys(item.results).length > 0);
    if (!list.length || zipping) return;

    setZipping(true);
    try {
      const zip: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      const multiple = list.length > 1;
      for (const item of list) {
        const folder = multiple ? `${slug(item.name)}/` : "";
        for (const result of Object.values(item.results)) {
          const name = zipName(
            used,
            `${folder}${result.presetId}-${result.w}x${result.h}.${extensionFor(result.blob)}`
          );
          zip[name] = new Uint8Array(await result.blob.arrayBuffer());
        }
      }
      const blob = await makeZip(zip);
      saveBlob(blob, multiple ? "kilosmith-batch.zip" : `kilosmith-${slug(list[0].name)}.zip`);
    } finally {
      setZipping(false);
    }
  }

  // Paste only means "start a batch" while the dropzone is on screen; otherwise
  // every ⌘V in the text fields below would silently add the clipboard image.
  useEffect(() => {
    if (items.length) return;
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const selectedPresets = PRESETS.filter((preset) => settings.selected.includes(preset.id));
  const finished = items.flatMap((item) => Object.values(item.results));
  const totalBytes = finished.reduce((sum, result) => sum + result.blob.size, 0);
  const totalExpected = selectedPresets.length * items.length;

  return (
    <div className="w-full">
      {items.length === 0 ? (
        <DropZone
          onFiles={addFiles}
          multiple
          accent="bg-sun"
          doodle="plop it here"
          title="Drop an image, or click to browse"
          hint="JPG, PNG, WebP or AVIF — up to 18 sizes each. Or just paste with ⌘V. Nothing is uploaded; it all happens in this tab."
        />
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper-2 px-2.5 py-2">
          <p className="font-[family-name:var(--font-display)] text-[13.5px] text-ink-2">
            {items.length} photo{items.length > 1 ? "s" : ""} ·{" "}
            <span className="text-ink">{finished.length}</span>
            /{totalExpected} sizes squished
          </p>
          <div className="flex items-center gap-2">
            <MiniButton onClick={() => inputRef.current?.click()}>+ add one</MiniButton>
            <MiniButton onClick={reset}>clear all</MiniButton>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        aria-label="Add photos to resize"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[272px_minmax(0,1fr)]">
          <aside className="order-2 md:order-1 md:sticky md:top-6 md:self-start">
            <div className="pane p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
                  Sizes
                </p>
                <div className="flex gap-1.5">
                  <MiniButton onClick={() => patchSettings({ selected: PRESETS.map((p) => p.id) })}>
                    all
                  </MiniButton>
                  <MiniButton onClick={() => patchSettings({ selected: DEFAULT_SELECTION })}>
                    reset
                  </MiniButton>
                </div>
              </div>

              <div className="mt-3 space-y-3.5">
                {GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 font-[family-name:var(--font-display)] text-[12.5px] font-medium uppercase tracking-[0.1em] text-accent-deep">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESETS.filter((preset) => preset.group === group.id).map((preset) => (
                        <Chip
                          key={preset.id}
                          active={settings.selected.includes(preset.id)}
                          onClick={() => togglePreset(preset.id)}
                          title={`${preset.label} · ${preset.w}×${preset.h}`}
                        >
                          {preset.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4 hairline pt-4">
                <div>
                  <p className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
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
                  <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                    {settings.fit === "crop"
                      ? "Finds the busiest part of the photo so faces stay in frame."
                      : "Keeps the whole photo and fills the leftover space with a colour."}
                    Cut-outs with transparency are always fitted, never cropped.
                  </p>
                </div>

                <div>
                  <p className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink">
                    Format
                  </p>
                  <Segmented
                    options={FORMATS.filter(
                      (entry) => entry.value !== "avif" && supported[entry.value] !== false
                    ).map((entry) => ({ value: entry.value, label: entry.label }))}
                    value={settings.format}
                    onChange={(value) => patchSettings({ format: value as OutFormat })}
                  />
                  <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                    Icons always export as PNG.
                  </p>
                </div>

                {settings.format !== "png" && (
                  <Slider
                    label="Quality"
                    min={60}
                    max={100}
                    value={Math.round(settings.quality * 100)}
                    display={`${Math.round(settings.quality * 100)}`}
                    onChange={(value) =>
                      patchSettings({ quality: Math.min(1, Math.max(0.1, value / 100)) })
                    }
                  />
                )}

                {settings.fit === "pad" && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
                      Padding colour
                    </p>
                    <input
                      type="color"
                      aria-label="Padding colour"
                      value={settings.background}
                      onChange={(event) => patchSettings({ background: event.target.value })}
                      className="h-8 w-12"
                    />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={downloadAll}
                  disabled={!finished.length || zipping}
                >
                  <IconDownload size={14} />
                  {zipping ? "Packing…" : `Download all · ${formatBytes(totalBytes)}`}
                </Button>
                <p className="text-center text-[12px] text-muted">
                  ZIP · stored, not re-compressed · {finished.length} files
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
  const state = item.status === "error" ? "error" : done ? "done" : "working";

  return (
    <div className="pop-sm overflow-hidden bg-card">
      <div className="flex flex-wrap items-center gap-3 bg-paper-2 px-3 py-2.5">
        <div className="thumb size-10 shrink-0">
          <img src={item.thumb} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-display)] text-[14.5px] font-medium text-ink">
            {item.name}
          </p>
          <p className="text-[12.5px] text-muted tabular-nums">
            {formatBytes(item.file.size)} in · {results.length}/{presets.length} out
          </p>
        </div>
        <StatusTag state={state} text={item.status === "error" ? "failed" : undefined} />
        <MiniButton onClick={() => setAdjusting((value) => !value)} active={adjusting || !!item.focus}>
          {item.focus ? "pinned" : "crop"}
        </MiniButton>
        <IconButton onClick={() => onRemove(item.id)} label={`Remove ${item.name}`}>
          <IconClose size={12} />
        </IconButton>
      </div>

      {adjusting && (
        <div className="border-t-2 border-ink/10 p-3">
          <div className="thumb relative">
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
                className="pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-ink bg-accent shadow-[2px_2px_0_var(--color-shadow)]"
                style={{ left: `${item.focus.x * 100}%`, top: `${item.focus.y * 100}%` }}
                aria-hidden
              >
                <span className="size-1.5 rounded-full bg-ink" />
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted">
              Click on the subject — every size re-crops around your pin.
            </p>
            <MiniButton onClick={() => onFocus(item.id)} disabled={!item.focus}>
              let the robot decide
            </MiniButton>
          </div>
        </div>
      )}

      {item.error ? (
        <p className="px-4 py-4 text-[13px] text-error">
          {item.error}. A JPG or PNG usually behaves better.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 p-3 lg:grid-cols-3 xl:grid-cols-4">
          {presets.map((preset) => {
            const result = item.results[preset.id];
            return (
              <div key={preset.id} className="tile">
                <div className="bg-checker relative" style={{ height: 118 }}>
                  {result ? (
                    <img
                      src={result.url}
                      alt={preset.label}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="sticker animate-pulse bg-paper text-[11px]">cooking…</span>
                    </div>
                  )}
                  {result && (
                    <button
                      type="button"
                      onClick={() => onDownload(item, result)}
                      aria-label={`Download ${preset.label}`}
                      title={`Download ${preset.label}`}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full border-2 border-ink bg-sun text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-6 active:translate-y-0.5 active:shadow-none"
                    >
                      <IconDownload size={12} />
                    </button>
                  )}
                </div>
                <div className="tile-foot tile-foot-col">
                  <span className="w-full truncate" title={preset.label}>
                    {preset.label}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    {preset.w}×{preset.h}
                    {result ? ` · ${formatBytes(result.blob.size)}` : " · …"}
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

