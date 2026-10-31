import Link from "next/link";
import { site, tools } from "@/lib/site";
import { IconGithub } from "@/components/icons";

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
  { href: "/cookies", label: "Cookies" },
];

const SOCIAL = [
  { href: site.author.github, label: "GitHub", handle: "@Anos714" },
  { href: site.author.x, label: "X", handle: "@anos714" },
  { href: site.author.linkedin, label: "LinkedIn", handle: "Rahul Sain" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/70">
      <div className="mx-auto w-full max-w-6xl px-5 pt-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-acid font-mono text-[12px] font-bold text-ink">
                s
              </span>
              <span className="font-mono text-[13px] text-zinc-100">{site.name}</span>
            </Link>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-zinc-500">
              {site.tagline} {tools.length} tools for images and video that run entirely in your
              browser.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={site.author.github}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="GitHub"
                className="flex size-8 items-center justify-center rounded-md border border-line text-zinc-400 transition hover:border-line-2 hover:text-zinc-100"
              >
                <IconGithub size={15} />
              </a>
              <a
                href={site.author.x}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="X"
                className="flex size-8 items-center justify-center rounded-md border border-line font-mono text-[12px] text-zinc-400 transition hover:border-line-2 hover:text-zinc-100"
              >
                ✕
              </a>
              <a
                href={site.author.linkedin}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="LinkedIn"
                className="flex size-8 items-center justify-center rounded-md border border-line font-mono text-[11px] text-zinc-400 transition hover:border-line-2 hover:text-zinc-100"
              >
                in
              </a>
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Tools</p>
            <ul className="mt-3 space-y-2">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <Link
                    href="/#tools"
                    className="text-[12.5px] text-zinc-500 transition hover:text-zinc-200"
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Legal</p>
            <ul className="mt-3 space-y-2">
              {LEGAL.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[12.5px] text-zinc-500 transition hover:text-zinc-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Elsewhere
            </p>
            <ul className="mt-3 space-y-2">
              {SOCIAL.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[12.5px] text-zinc-500 transition hover:text-zinc-200"
                  >
                    {item.label}{" "}
                    <span className="font-mono text-[10px] text-zinc-600">{item.handle}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${site.author.email}`}
                  className="text-[12.5px] text-zinc-500 transition hover:text-zinc-200"
                >
                  Email
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-line/70 py-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[10.5px] text-zinc-600">
            © {site.year} {site.name} — built by {site.author.name}
          </p>
          <p className="font-mono text-[10.5px] text-zinc-700">
            no uploads · no accounts · no telemetry
          </p>
        </div>
      </div>

      <div className="select-none overflow-hidden">
        <p
          aria-hidden
          className="translate-y-[8%] text-center text-[clamp(4rem,19vw,15rem)] font-semibold leading-[0.8] tracking-[-0.06em] text-zinc-100/[0.07]"
        >
          {site.name}
        </p>
      </div>
    </footer>
  );
}
