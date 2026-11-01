import Link from "next/link";
import { Brand } from "@/components/brand";
import { site, tools } from "@/lib/site";
import { IconCoffee, IconGithub } from "@/components/icons";

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
  { href: "/cookies", label: "Cookies" },
];

const SOCIAL = site.social;

export function SiteFooter() {
  return (
    <footer className="mt-[var(--section-gap-s)] border-t-[2.5px] border-ink bg-paper-2">
      <div className="container pt-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_1fr]">
          <div>
            <Brand size={36} />
            <p className="mt-4 max-w-[32ch] text-[14.5px] leading-relaxed text-ink-2">
              {site.tagline} Eight tools for images and video that run entirely in your browser —
              cheerful, fast, and a little bit smug about not uploading anything.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <a
                href={site.author.github}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Kilosmith on GitHub"
                className="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-card text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-sun hover:shadow-[3px_3px_0_var(--color-shadow)]"
              >
                <IconGithub size={17} />
              </a>
              <a
                href={site.author.x}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Rahul Sain on X"
                className="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-card font-[family-name:var(--font-display)] text-[15px] font-semibold text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-mint hover:shadow-[3px_3px_0_var(--color-shadow)]"
              >
                X
              </a>
              <a
                href={site.author.linkedin}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Rahul Sain on LinkedIn"
                className="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-card font-[family-name:var(--font-display)] text-[13px] font-semibold text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac hover:shadow-[3px_3px_0_var(--color-shadow)]"
              >
                in
              </a>
              <a
                href={site.author.coffee}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Buy Rahul Sain a coffee"
                className="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-butter text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:rotate-[-6deg] hover:bg-sun hover:shadow-[3px_3px_0_var(--color-shadow)]"
              >
                <IconCoffee size={18} />
              </a>
            </div>
          </div>

          <div>
            <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
              Tools
            </p>
            <ul className="mt-3 space-y-2">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <Link
                    href="/#tools"
                    className="text-[14px] text-ink-2 decoration-accent transition-colors hover:text-accent-deep hover:underline hover:underline-offset-4"
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
              Legal
            </p>
            <ul className="mt-3 space-y-2">
              {LEGAL.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[14px] text-ink-2 decoration-accent transition-colors hover:text-accent-deep hover:underline hover:underline-offset-4"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-ink">
              Elsewhere
            </p>
            <ul className="mt-3 space-y-2">
              {SOCIAL.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group flex flex-wrap items-baseline gap-x-2 text-[14px] text-ink-2 transition-colors hover:text-accent-deep"
                  >
                    {item.label}
                    <span className="text-[12px] text-muted">{item.handle}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${site.author.email}`}
                  className="break-all text-[14px] text-ink-2 decoration-accent transition-colors hover:text-accent-deep hover:underline hover:underline-offset-4"
                >
                  {site.author.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t-2 border-dashed border-rule-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">
            © {site.year} {site.name}, built by{" "}
            <a
              href={site.author.github}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-ink-2 decoration-accent underline-offset-4 hover:text-accent-deep hover:underline"
            >
              {site.author.name}
            </a>
            . Powered by coffee and good intentions.
          </p>
          <div className="flex flex-wrap gap-2 text-[12px]">
            {["no uploads", "no accounts", "no telemetry"].map((note) => (
              <span
                key={note}
                className="rounded-full border-2 border-ink/80 bg-card px-2.5 py-0.5 text-ink-2"
              >
                {note}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="wordmark select-none overflow-hidden" data-name={site.name} aria-hidden />
    </footer>
  );
}
