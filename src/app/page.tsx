import type { Metadata } from "next";
import ToolSwitcher from "@/components/tool-switcher";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { faq } from "@/lib/faq";
import { site, tools } from "@/lib/site";
import { PRESETS } from "@/lib/presets";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    title: "Local by construction",
    body: "Decoding and encoding happen in your tab. There is no upload endpoint to leak, because there is no server at all.",
  },
  {
    title: "Smart crop, not squish",
    body: "A saliency pass finds the subject — faces, edges, contrast — and crops around it. Click once to override it yourself.",
  },
  {
    title: "ZIP or single files",
    body: "Every result is cached the moment it renders, so one download is instant and “download all” only zips what already exists.",
  },
  {
    title: "Video without a server bill",
    body: "WebCodecs re-encodes MP4 and MOV on your GPU. Pick a bitrate, cap the resolution, watch the file shrink.",
  },
  {
    title: "Formats that stay honest",
    body: "PNG, JPEG, WebP and AVIF. sizekit probes your encoder first, so a format is only offered if it can really be produced.",
  },
  {
    title: "Nothing to sign up for",
    body: "No account, no watermark, no daily quota. Open the tab, work, close it. Your files never left your machine.",
  },
];

export default function Home() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 dotted opacity-70" />
          <div className="relative mx-auto w-full max-w-6xl px-5 pb-8 pt-14 sm:px-8 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
                {tools.length} tools · 0 uploads · 0 accounts
              </p>
              <h1 className="mt-4 text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] text-zinc-50 sm:text-[68px]">
                Every size.
                <br className="sm:hidden" /> Every format.{" "}
                <span className="font-serif italic font-normal text-acid">Nothing uploaded.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-[14.5px] leading-relaxed text-zinc-400">
                Crop, resize, compress and convert images. Shrink video, build GIFs, memes and
                favicons. {tools.length} tools that run in your browser and never touch a server.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {["no sign-up", "no watermark", "works offline", "free forever"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-zinc-500"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-10">
              <ToolSwitcher />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pt-14 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-[20px] font-medium tracking-[-0.02em] text-zinc-100">
              Built to behave like software, not a website
            </h2>
            <span className="hidden font-mono text-[10.5px] text-zinc-600 sm:block">
              {tools.length} tools, one rule: your file stays yours
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 40}>
                <article className="h-full rounded-xl border border-line bg-panel p-4 transition hover:border-line-2">
                  <span className="font-mono text-[10px] text-zinc-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-[13px] font-medium text-zinc-200">{feature.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{feature.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-4 w-full max-w-6xl px-5 sm:px-8">
          <div className="grid gap-3 rounded-xl border border-line bg-panel px-5 py-5 sm:grid-cols-4">
            {[
              { value: `${PRESETS.length}`, label: "export presets" },
              { value: "0", label: "network requests while working" },
              { value: "~440ms", label: "12MP photo → 9 sizes" },
              { value: "4", label: "image formats, real ones" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-[22px] font-medium tracking-tight text-zinc-100">{stat.value}</p>
                <p className="mt-0.5 font-mono text-[10px] leading-snug text-zinc-600">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto w-full max-w-6xl px-5 pt-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                FAQ
              </p>
              <h2 className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.03em] text-zinc-100">
                Questions,
                <span className="font-serif italic font-normal text-acid"> answered.</span>
              </h2>
              <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-zinc-500">
                Still curious? The whole codebase is public —{" "}
                <a
                  href={site.author.github}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-zinc-300 underline decoration-line underline-offset-4 transition hover:decoration-acid"
                >
                  read it on GitHub
                </a>
                .
              </p>
            </div>

            <div className="divide-y divide-line border-t border-line">
              {faq.map((entry) => (
                <details key={entry.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[13px] text-zinc-200 marker:hidden">
                    {entry.question}
                    <span className="mt-0.5 shrink-0 font-mono text-[13px] text-zinc-600 transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-zinc-500">
                    {entry.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-20 w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-line bg-panel px-5 py-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[15px] text-zinc-100">Open a tab, drop a file, done.</p>
              <p className="mt-1 text-[12px] text-zinc-500">
                No account, no cloud, no upload bar to watch.
              </p>
            </div>
            <a
              href="#tools"
              className="rounded-lg bg-acid px-4 py-2 text-[12.5px] font-medium text-ink transition hover:brightness-95"
            >
              Pick a tool
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
