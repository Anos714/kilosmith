import Link from "next/link";
import { site } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-acid font-mono text-[12px] font-bold text-ink">
            s
          </span>
          <span className="font-mono text-[13px] tracking-tight text-zinc-100">{site.name}</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/#tools"
            className="rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-500 transition hover:text-zinc-200"
          >
            tools
          </Link>
          <Link
            href="/#faq"
            className="hidden rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-500 transition hover:text-zinc-200 sm:block"
          >
            faq
          </Link>
          <a
            href={site.author.github}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-1 flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 transition hover:border-line-2 hover:text-zinc-100"
          >
            github
            <span className="text-zinc-600">↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
