import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That page is not here. The Kilosmith tools — resize, crop, compress, convert, video, GIF, meme and favicon — are one click away on the home page.",
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container flex-1 pb-16 pt-16 text-center sm:pt-24">
        <span className="sticker -rotate-2 bg-sun text-[13px]">error 404</span>
        <h1 className="mx-auto mt-6 max-w-[20ch] text-[clamp(2.4rem,5vw,4rem)] [overflow-wrap:break-word]">
          This page got squished out of existence
        </h1>
        <p className="lead mx-auto mt-5 max-w-[52ch] text-ink-2">
          Nothing lives at this address. The files you came to shrink, chop or convert are all on
          the home page — still local, still free, still wearing no watermark.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-accent px-6 py-3.5 font-[family-name:var(--font-display)] text-[16px] font-semibold text-accent-ink shadow-[4px_4px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-1 hover:bg-accent-3 hover:shadow-[6px_6px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[2px_2px_0_var(--color-shadow)]"
          >
            Back to the tools
            <span aria-hidden className="text-lg leading-none">
              ↘
            </span>
          </Link>
          <Link
            href="/#tools"
            className="inline-flex items-center justify-center rounded-full border-2 border-ink bg-card px-6 py-3.5 font-[family-name:var(--font-display)] text-[16px] font-medium text-ink shadow-[4px_4px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-1 hover:bg-butter hover:shadow-[6px_6px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[2px_2px_0_var(--color-shadow)]"
          >
            See all 8 tools
          </Link>
        </div>

        <p className="mt-8 text-[13px] text-muted">
          Or read{" "}
          <a
            href="/privacy"
            className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4"
          >
            the privacy page
          </a>{" "}
          for why no file ever leaves this tab.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
