import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";

export function LegalPage({
  title,
  intro,
  updated = "30 October 2026",
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-14 sm:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          Legal · updated {updated}
        </p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.035em] text-zinc-50">
          {title}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{intro}</p>

        <div className="mt-10 space-y-8 text-[13px] leading-relaxed text-zinc-400 [&_a]:text-zinc-200 [&_a]:underline [&_a]:decoration-line [&_a]:underline-offset-4 [&_h2]:mb-2 [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:text-zinc-100 [&_li]:ml-4 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:space-y-1.5">
          {children}
        </div>

        <div className="mt-12 rounded-xl border border-line bg-panel px-4 py-3 text-[12px] text-zinc-500">
          Questions about this page? Write to{" "}
          <a href={`mailto:${site.author.email}`} className="text-zinc-200 underline decoration-line underline-offset-4">
            {site.author.email}
          </a>{" "}
          — a human ({site.author.name}) answers.
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
