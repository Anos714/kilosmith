import Link from "next/link";
import { Brand } from "@/components/brand";
import { IconGithub } from "@/components/icons";
import { IconBMC } from "@/components/logo-bmc";
import { ThemeToggle } from "@/components/theme-toggle";
import { site } from "@/lib/site";

const LINKS = [
  { href: "/#tools", label: "Tools", color: "hover:bg-sun" },
  { href: "/#how", label: "How it works", color: "hover:bg-mint" },
  { href: "/#faq", label: "FAQ", color: "hover:bg-lilac" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-[300] border-b-[2.5px] border-ink bg-paper/95 backdrop-blur-sm">
      <div className="container flex min-h-[70px] items-center justify-between gap-4 py-2.5">
        <Brand />

        <nav className="flex items-center gap-2.5" aria-label="Primary">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hidden shrink-0 whitespace-nowrap rounded-full border-2 border-transparent px-3 py-1.5 font-[family-name:var(--font-display)] text-[15px] font-medium text-ink-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:text-ink hover:shadow-[2px_2px_0_var(--color-shadow)] sm:block ${link.color}`}
            >
              {link.label}
            </Link>
          ))}
          <span className="sticker hidden shrink-0 gap-1.5 border-mint-deep/40 bg-mint text-mint-deep md:inline-flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint-deep opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-mint-deep" />
            </span>
            0 bytes uploaded
          </span>
          <ThemeToggle />
          <a
            href={site.author.github}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-ink bg-paper px-3.5 py-2 font-[family-name:var(--font-display)] text-[14px] font-medium text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-butter hover:shadow-[3px_3px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-none"
          >
            <IconGithub size={16} />
            <span className="hidden sm:inline">GitHub</span>
            <span className="sm:hidden">Code</span>
          </a>
          <a
            href={site.author.coffee}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Buy me a coffee"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-ink bg-sun px-3.5 py-2 font-[family-name:var(--font-display)] text-[14px] font-medium text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-butter hover:shadow-[3px_3px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-none"
          >
            <IconBMC size={16} />
            <span className="hidden lg:inline">Buy me a coffee</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
