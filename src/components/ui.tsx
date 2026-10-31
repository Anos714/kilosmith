"use client";

import { useRef, useState, type ReactNode } from "react";
import { IconUpload } from "@/components/icons";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-[14px] border border-line bg-panel ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  hint,
  right,
  children,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
        {right}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md transition ${
            size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[12px]"
          } font-mono ${
            value === option.value
              ? "bg-line-2 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display?: string;
}) {
  return (
    <Field label={label} right={<span className="font-mono text-[10px] text-zinc-400">{display ?? value}</span>}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </Field>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? "bg-acid text-ink hover:brightness-95 disabled:bg-line disabled:text-zinc-600"
      : variant === "secondary"
        ? "border border-line text-zinc-200 hover:border-line-2 hover:bg-panel-2 disabled:text-zinc-600"
        : "text-zinc-400 hover:text-zinc-100";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
        active
          ? "border-acid/40 bg-acid/10 text-acid"
          : "border-line text-zinc-500 hover:border-line-2 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export function DropZone({
  onFiles,
  accept = "image/*",
  multiple = false,
  title = "Drop files here, or click to browse",
  hint = "Nothing is uploaded. Everything runs in this tab.",
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files).filter((file) =>
          accept === "*" ? true : accept.split(",").some((type) => file.type.startsWith(type.trim().replace("*", "")))
        );
        if (files.length) onFiles(files);
      }}
      role="button"
      tabIndex={0}
      className={`group relative cursor-pointer overflow-hidden rounded-[14px] border border-dashed text-center transition ${
        compact ? "px-4 py-5" : "px-6 py-12 sm:py-16"
      } ${dragging ? "border-acid/70 bg-acid/[0.04]" : "border-line bg-panel hover:border-line-2"}`}
    >
      {!compact && <div className="pointer-events-none absolute inset-0 glow" />}
      <div className="relative flex flex-col items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-xl border border-line bg-ink text-acid">
          <IconUpload size={17} />
        </div>
        <p className="text-[14px] font-medium text-zinc-200">{title}</p>
        <p className="max-w-xs font-mono text-[10.5px] leading-relaxed text-zinc-500">{hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-3 animate-spin rounded-full border border-zinc-600 border-t-acid ${className}`}
    />
  );
}

export function ToolHeading({
  title,
  blurb,
  aside,
}: {
  title: string;
  blurb: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
      <div>
        <h2 className="text-[14px] font-medium text-zinc-100">{title}</h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">{blurb}</p>
      </div>
      {aside}
    </div>
  );
}
