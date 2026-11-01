"use client";

import { useRef, useState, type ReactNode } from "react";
import { IconUpload } from "@/components/icons";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`pane ${className}`}>{children}</div>;
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
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-[family-name:var(--font-display)] text-[14px] font-medium text-ink-2">
          {label}
        </p>
        {right}
      </div>
      {children}
      {hint && <p className="mt-2 text-[12px] leading-relaxed text-muted">{hint}</p>}
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
    <div className="flex w-full max-w-full flex-wrap gap-1 rounded-[var(--radius-input)] border-2 border-ink bg-card p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`${
            size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
          } min-w-0 flex-1 basis-[58px] whitespace-nowrap rounded-full font-[family-name:var(--font-display)] font-medium transition-all duration-200 ${
            value === option.value
              ? "bg-ink text-paper shadow-[2px_2px_0_var(--color-shadow)]"
              : "text-muted hover:bg-butter hover:text-ink"
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
    <Field
      label={label}
      right={<span className="text-[13px] font-medium text-ink-2 tabular-nums">{display ?? value}</span>}
    >
      <input
        type="range"
        aria-label={label}
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
      ? "border-2 border-ink bg-accent text-accent-ink shadow-[3px_3px_0_var(--color-shadow)] hover:-translate-y-0.5 hover:bg-accent-3 hover:shadow-[4px_4px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[1px_1px_0_var(--color-shadow)] disabled:border-rule-2 disabled:bg-rule disabled:text-muted disabled:shadow-none"
      : variant === "secondary"
        ? "border-2 border-ink bg-card text-ink shadow-[3px_3px_0_var(--color-shadow)] hover:-translate-y-0.5 hover:bg-butter hover:shadow-[4px_4px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[1px_1px_0_var(--color-shadow)] disabled:border-rule-2 disabled:text-muted disabled:shadow-none"
        : "border-2 border-transparent text-muted hover:border-ink hover:bg-sun hover:text-ink disabled:text-rule-2";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-[family-name:var(--font-display)] text-[14px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:translate-y-0 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Small sticker-shaped action used inside the workbench (Add, Clear, All, Reset). */
export function MiniButton({
  children,
  onClick,
  disabled,
  active,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`pill-btn ${active ? "bg-ink text-paper" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Round icon-only sticker button. `label` is required — it becomes the accessible name. */
export function IconButton({
  children,
  onClick,
  label,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`icon-btn ${className}`}
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
      className={`rounded-full border-2 px-2.5 py-1 font-[family-name:var(--font-display)] text-[12px] font-medium transition-all duration-200 ${
        active
          ? "border-ink bg-ink text-paper shadow-[2px_2px_0_var(--color-shadow)]"
          : "border-ink/25 bg-card text-muted hover:-translate-y-0.5 hover:border-ink hover:bg-sun hover:text-ink hover:shadow-[2px_2px_0_var(--color-shadow)]"
      }`}
    >
      {children}
    </button>
  );
}

const STATUS = {
  working: { tone: "bg-butter", text: "thinking…" },
  done: { tone: "bg-mint", text: "ready!" },
  error: { tone: "bg-coral", text: "oops" },
} as const;

/** The little status pill on every result row. */
export function StatusTag({ state, text }: { state: "working" | "done" | "error"; text?: string }) {
  const status = STATUS[state];
  return (
    <span className={`tag ${status.tone}`}>
      <span
        aria-hidden
        className={`size-1.5 rounded-full bg-ink ${state === "working" ? "animate-pulse" : ""}`}
      />
      {text ?? status.text}
    </span>
  );
}

export function DropZone({
  onFiles,
  accept = "image/*",
  multiple = false,
  title = "Drop a file here",
  hint = "or click to browse. Nothing is uploaded.",
  doodle = "plop it here",
  accent = "bg-sun",
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  doodle?: string;
  accent?: string;
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
          accept === "*"
            ? true
            : accept.split(",").some((type) => file.type.startsWith(type.trim().replace("*", "")))
        );
        if (files.length) onFiles(files);
      }}
      role="button"
      tabIndex={0}
      aria-label={title}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl border-[2.5px] border-dashed text-center transition-all duration-200 ${
        compact ? "px-4 py-6" : "px-6 py-12 sm:py-16"
      } ${
        dragging
          ? "-translate-y-1 border-ink bg-butter shadow-[6px_6px_0_var(--color-shadow)]"
          : "border-ink/30 bg-card hover:-translate-y-0.5 hover:border-ink hover:bg-paper-2 hover:shadow-[5px_5px_0_var(--color-shadow)]"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 opacity-[0.35] ${dragging ? "" : "bg-dots"}`}
      />
      <span
        aria-hidden
        className={`sticker absolute right-4 top-4 rotate-3 transition-transform duration-200 group-hover:-rotate-3 ${accent}`}
      >
        {doodle}
      </span>

      <div className="relative flex flex-col items-center gap-3">
        <span
          className={`flex size-14 items-center justify-center rounded-full border-2 border-ink text-ink shadow-[3px_3px_0_var(--color-shadow)] transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110 ${accent} ${
            dragging ? "animate-bounce" : ""
          }`}
        >
          <IconUpload size={22} />
        </span>
        <div>
          <p className="font-[family-name:var(--font-display)] text-[18px] font-semibold text-ink">
            {title}
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-muted">{hint}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        aria-label={title}
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
      className={`inline-block size-4 animate-spin rounded-full border-2 border-ink/20 border-t-accent-deep ${className}`}
      aria-hidden
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink/15 px-1 py-3">
      <div>
        <h3 className="text-[19px] text-ink">{title}</h3>
        <p className="mt-1 text-[13px] text-muted">{blurb}</p>
      </div>
      {aside}
    </div>
  );
}
