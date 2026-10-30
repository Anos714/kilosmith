import SizeKit from "@/components/sizekit";
import { PRESETS } from "@/lib/presets";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-acid font-mono text-[11px] font-bold text-ink">
              s
            </span>
            <span className="font-mono text-[13px] tracking-tight text-zinc-200">sizekit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-zinc-500 sm:flex">
              <span className="size-1.5 rounded-full bg-acid" />
              runs locally
            </span>
            <a
              href="#how"
              className="rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-500 transition hover:text-zinc-200"
            >
              how it works
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <section className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {PRESETS.length} presets · smart crop · no uploads
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50 sm:text-6xl">
            One photo.
            <span className="text-acid"> Every</span> size.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Drop an image and get correctly cropped files for Instagram, X, LinkedIn, link
            previews and app icons. Take the whole set as a ZIP, or grab one file at a time.
          </p>
        </section>

        <div className="mx-auto mt-9 max-w-4xl">
          <SizeKit />
        </div>

        <section id="how" className="mt-20 grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "Correct crops, not squashed",
              body: "A saliency pass finds the busiest part of the photo — faces, edges, text — and crops around it instead of shrinking the whole frame.",
            },
            {
              title: "ZIP or single files",
              body: "Every size appears the moment it finishes rendering. Download one, or the whole set in a stored ZIP that packs in milliseconds.",
            },
            {
              title: "Your photos stay yours",
              body: "No upload, no account, no telemetry. Decoding and encoding happen in your browser tab, so the network panel stays empty.",
            },
          ].map((feature) => (
            <article
              key={feature.title}
              data-reveal
              className="reveal rounded-xl border border-line bg-panel p-5"
            >
              <h2 className="text-[13px] font-medium text-zinc-200">{feature.title}</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{feature.body}</p>
            </article>
          ))}
        </section>

        <section
          data-reveal
          className="reveal mt-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-line bg-panel px-5 py-4 sm:flex-row sm:items-center"
        >
          <p className="font-mono text-[11px] text-zinc-500">
            <span className="text-acid">{PRESETS.length}</span> sizes · 0 uploads · 0 accounts · 0
            telemetry
          </p>
          <p className="font-mono text-[11px] text-zinc-600">
            works offline once the tab is open
          </p>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <p className="font-mono text-[11px] text-zinc-600">
            sizekit — decode once, render every size, send nothing.
          </p>
          <p className="font-mono text-[11px] text-zinc-700">
            Next.js · Bun · React Compiler
          </p>
        </div>
      </footer>
    </div>
  );
}
