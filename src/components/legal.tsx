import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";

export function LegalPage({
  title,
  intro,
  updated = "1 November 2026",
  children,
}: {
  title: string;
  intro: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="container flex-1 pb-16 pt-12 sm:pt-16">
        <div className="mx-auto max-w-[70ch] text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="sticker -rotate-1 bg-lilac text-[12px]">the fine print</span>
            <span className="text-[13px] text-muted">updated {updated}</span>
          </div>
          <h1 className="mt-5 min-w-0 text-[clamp(2.4rem,4.4vw,3.6rem)] [overflow-wrap:break-word]">
            {title}
          </h1>
          <p className="lead mx-auto mt-5 max-w-[58ch] text-ink-2">{intro}</p>

          <div className="pop mt-10 bg-card p-6 text-left sm:p-8">
            <div className="space-y-8 text-[15px] leading-relaxed text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:decoration-accent [&_a]:decoration-2 [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-accent [&_p+p]:mt-3 [&_ul]:space-y-2">
              {children}
            </div>
          </div>

          <div className="pop mt-8 rounded-2xl border-2 border-dashed border-rule-2 bg-card/60 px-4 py-4 text-[14px] text-muted">
            <p>
              Questions about this page? Write to{" "}
              <a
                href={`mailto:${site.author.email}`}
                className="break-all font-medium text-ink underline decoration-accent decoration-2 underline-offset-4"
              >
                {site.author.email}
              </a>{" "}
              — a human ({site.author.name}) answers.
            </p>
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px]">
              {site.social.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-[family-name:var(--font-display)] font-medium text-ink-2 decoration-accent underline-offset-4 transition-colors hover:text-accent-deep hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
