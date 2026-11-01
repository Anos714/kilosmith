import Link from "next/link";
import { site } from "@/lib/site";

/** The weight ladder: one goofy little bar chart wearing a smile. */
export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className={`shrink-0 [filter:drop-shadow(2px_2px_0_var(--color-shadow))] ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="33" height="33" rx="10" fill="var(--color-sun)" stroke="var(--color-ink)" strokeWidth="2.5" />
      <rect x="8.5" y="9.5" width="19" height="4.5" rx="2.25" fill="var(--color-ink)" />
      <rect x="8.5" y="16.5" width="13" height="4.5" rx="2.25" fill="var(--color-ink)" />
      <path d="M8.5 25.5h8.5" stroke="var(--color-accent)" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="26.5" cy="25.5" r="1.9" fill="var(--color-ink)" />
    </svg>
  );
}

export function Brand({ size = 34 }: { size?: number }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5"
      aria-label={`${site.name} home`}
    >
      <Mark size={size} className="transition-transform duration-[var(--dur-short)] group-hover:-rotate-6" />
      <span className="font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-0.02em] text-ink">
        {site.name}
      </span>
    </Link>
  );
}
