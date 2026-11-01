import type { Metadata } from "next";
import ToolSwitcher from "@/components/tool-switcher";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Faq } from "@/components/faq";
import { IconCoffee } from "@/components/icons";
import { faq } from "@/lib/faq";
import { site, tools } from "@/lib/site";
import { PRESETS } from "@/lib/presets";

export const metadata: Metadata = {
  title: `${site.name}: ${site.tagline}`,
  description: site.description,
  alternates: { canonical: "/" },
};

const FACTS = [
  ["Tools", "eight, all free"],
  ["Uploads", "0 bytes"],
  ["Account", "haha, no"],
  ["Formats", "JPEG · PNG · WebP · AVIF"],
  ["Price", "free forever"],
];

const FEATURES = [
  {
    title: "Local by construction",
    body: "Decoding and encoding happen in your tab. There is no upload endpoint to leak, because there is no server at all.",
    color: "bg-sun",
    tilt: "-1.5deg",
  },
  {
    title: "Smart crop, not squish",
    body: "A saliency pass finds the subject (faces, edges, contrast) and crops around it. Click once to override it yourself.",
    color: "bg-mint",
    tilt: "1deg",
  },
  {
    title: "ZIP or single files",
    body: "Every result is cached the moment it renders, so one download is instant and download-all only zips what already exists.",
    color: "bg-lilac",
    tilt: "-0.8deg",
  },
  {
    title: "Video without a server bill",
    body: "WebCodecs re-encodes MP4 and MOV on your GPU. Trim the ends, pick a bitrate, cap the resolution, watch the file shrink.",
    color: "bg-bubble",
    tilt: "1.4deg",
  },
  {
    title: "Formats that stay honest",
    body: "PNG, JPEG, WebP and AVIF. Kilosmith probes your encoder first, so a format is only offered if it can really be produced.",
    color: "bg-sky",
    tilt: "-1.2deg",
  },
  {
    title: "Nothing to sign up for",
    body: "No account, no watermark, no daily quota. Open the tab, work, close it. Your files never left your machine.",
    color: "bg-coral",
    tilt: "0.8deg",
  },
];

const MARQUEE = [
  "0 bytes uploaded",
  "no sign-up",
  "no watermark",
  "no daily quota",
  "works offline",
  "free forever",
  "your files stay put",
];

function Sparkle({ className = "", size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.5c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7Z" fill="var(--color-sun)" />
    </svg>
  );
}

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
        {/* ---------------------------------------------------------------- hero */}
        <section className="relative overflow-hidden border-b-[2.5px] border-ink">
          <div
            aria-hidden
            className="float-slow pointer-events-none absolute -right-24 -top-24 size-[26rem] rounded-full bg-bubble/50 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-28 bottom-6 size-72 rounded-full bg-mint/45 blur-2xl"
          />
          <Sparkle className="absolute right-[8%] top-24 hidden lg:block" size={40} />
          <Sparkle className="absolute right-[38%] top-10 hidden rotate-12 lg:block" size={22} />
          <span
            aria-hidden
            className="pointer-events-none absolute left-[46%] top-[58%] hidden size-3 rounded-full bg-accent lg:block"
          />

          <div className="container relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
            <div className="settle">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="sticker -rotate-2 bg-sun">
                  <Sparkle size={14} className="shrink-0" /> 8 free tools
                </span>
                <span className="sticker rotate-1 bg-mint text-mint-deep">
                  <span className="size-2 rounded-full bg-mint-deep" /> nothing gets uploaded
                </span>
              </div>

              <h1 className="mt-7 text-[clamp(2.9rem,6vw,5.6rem)] leading-[0.98]">
                Heavy files,
                <br />
                made <span className="marker inline-block">light.</span>
              </h1>

              <p className="lead mt-6 max-w-[48ch] text-[17px] text-ink-2 sm:text-[19px]">
                Kilosmith is the friendly little workshop that squishes your photos, videos, GIFs
                and memes down to size — right inside your browser. No uploads. No sign-up. No
                sad little progress bar on someone else&apos;s server.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <a
                  href="#tools"
                  className="inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-accent px-6 py-3.5 font-[family-name:var(--font-display)] text-[16px] font-semibold text-accent-ink shadow-[4px_4px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-1 hover:bg-accent-3 hover:shadow-[6px_6px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[2px_2px_0_var(--color-shadow)]"
                >
                  Squish a file
                  <span aria-hidden className="text-lg leading-none">↘</span>
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-full border-2 border-ink bg-card px-6 py-3.5 font-[family-name:var(--font-display)] text-[16px] font-medium text-ink shadow-[4px_4px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-1 hover:bg-butter hover:shadow-[6px_6px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-[2px_2px_0_var(--color-shadow)]"
                >
                  How the magic works
                </a>
              </div>

              <p className="mt-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-[14px] text-muted">
                <span className="size-2 rounded-full bg-success" aria-hidden />
                Works offline. Your files never leave this tab.
              </p>
            </div>

            {/* the receipt */}
            <div className="relative mx-auto w-full max-w-[440px] lg:justify-self-end">
              <div className="tape -top-4 left-1/2 z-10 -translate-x-1/2 rotate-[-5deg]" />
              <div className="pop relative rotate-[1.2deg] bg-[var(--color-fringe)] px-6 pb-7 pt-8 transition-transform duration-300 hover:rotate-0">
                <span className="absolute -right-3 -top-4 z-10 rotate-12 rounded-full border-2 border-ink bg-accent px-3 py-1 font-[family-name:var(--font-display)] text-[13px] font-semibold text-accent-ink shadow-[2px_2px_0_var(--color-shadow)]">
                  zero bytes!
                </span>
                <p className="text-center font-[family-name:var(--font-display)] text-[13px] font-medium uppercase tracking-[0.22em] text-muted">
                  the short version
                </p>
                <p className="mt-1 text-center font-[family-name:var(--font-display)] text-[26px] font-semibold leading-tight text-ink">
                  a whole toolkit,
                  <br />
                  one tab
                </p>
                <dl className="mt-6 border-t-2 border-dashed border-rule-2">
                  {FACTS.map(([term, value]) => (
                    <div
                      key={term}
                      className="flex items-baseline justify-between gap-4 border-b-2 border-dashed border-rule py-3"
                    >
                      <dt className="font-[family-name:var(--font-display)] text-[14px] text-muted">
                        {term}
                      </dt>
                      <dd className="text-right text-[13.5px] font-medium text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-mint/50 px-3 py-2.5 text-center text-[12.5px] font-medium text-ink">
                  <span aria-hidden>🫶</span> No files were harmed, or uploaded.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- marquee */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0">
                {MARQUEE.map((item) => (
                  <span key={`${copy}-${item}`} className="marquee-item">
                    {item}
                    <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
                      <path d="M12 2.5c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7Z" fill="currentColor" />
                    </svg>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* --------------------------------------------------------------- tools */}
        <section id="tools" className="container pt-12 sm:pt-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-[family-name:var(--font-display)] text-[13px] font-medium uppercase tracking-[0.2em] text-accent-deep">
                the toy box
              </p>
              <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.6rem)]">Pick a tool. Break nothing.</h2>
            </div>
            <span className="sticker rotate-1 bg-butter">8 tools · 0 accounts · ∞ patience</span>
          </div>
          <ToolSwitcher />
        </section>

        {/* ----------------------------------------------------------------- how */}
        <section id="how" className="container pt-[var(--section-gap)]">
          <div className="max-w-[46rem]">
            <p className="font-[family-name:var(--font-display)] text-[13px] font-medium uppercase tracking-[0.2em] text-accent-deep">
              the not-so-secret sauce
            </p>
            <h2 className="mt-3">No upload. No account. No waiting room.</h2>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
              A normal media tool sends your file to a server, queues it, and sends back a smaller
              one. Kilosmith skips the round trip: the browser is the encoder. Your laptop does a
              little workout, and your file never leaves the room.
            </p>
          </div>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <li
                key={feature.title}
                style={{ rotate: feature.tilt }}
                className={`pop bg-card p-6 transition-transform duration-300 hover:-translate-y-1 hover:rotate-0`}
              >
                <span
                  className={`inline-flex size-11 items-center justify-center rounded-full border-2 border-ink font-[family-name:var(--font-display)] text-[18px] font-semibold shadow-[2px_2px_0_var(--color-shadow)] ${feature.color}`}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[21px] text-ink">{feature.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------------------- stats */}
        <section className="container pt-[var(--section-gap-s)]">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: `${PRESETS.length}`, label: "ways to resize one photo", color: "bg-sun", tilt: "-1.5deg" },
              { value: "0", label: "bytes uploaded, ever", color: "bg-mint", tilt: "1.2deg" },
              { value: "4", label: "image formats that behave", color: "bg-sky", tilt: "-0.8deg" },
              { value: `${tools.length}`, label: "tools, one happy tab", color: "bg-bubble", tilt: "1.6deg" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{ rotate: stat.tilt }}
                className={`pop-sm ${stat.color} px-6 py-6 transition-transform duration-300 hover:-translate-y-1 hover:rotate-0`}
              >
                <span className="figure block font-[family-name:var(--font-display)] text-[clamp(3rem,5vw,4.25rem)] font-semibold leading-[0.85] text-ink">
                  {stat.value}
                </span>
                <span className="mt-2 block text-[13.5px] font-medium leading-snug text-ink">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- faq */}
        <section id="faq" className="container pt-[var(--section-gap)]">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="font-[family-name:var(--font-display)] text-[13px] font-medium uppercase tracking-[0.2em] text-accent-deep">
                ask away
              </p>
              <h2 className="mt-3">Questions? We got you.</h2>
              <p className="mt-5 max-w-[36ch] text-[15px] leading-relaxed text-muted">
                Still curious? The whole codebase is public, which is a very nerdy way of saying
                &ldquo;go have a look&rdquo;.{" "}
                <a
                  href={site.author.github}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent-deep"
                >
                  read it on GitHub
                </a>
                .
              </p>
              <a
                href={site.author.coffee}
                target="_blank"
                rel="noreferrer noopener"
                className="sticker mt-6 gap-2.5 bg-butter text-[15px] shadow-[var(--shadow-pop)] transition-transform duration-200 hover:-translate-y-0.5 hover:rotate-[-2deg]"
              >
                <IconCoffee size={19} />
                buy me a coffee
              </a>
              <p className="mt-2.5 max-w-[34ch] text-[12.5px] leading-relaxed text-muted">
                Free tools and no server bills — the coffee is the only thing here that actually
                costs money.
              </p>
            </div>

            <Faq />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
