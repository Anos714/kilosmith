import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "Kilosmith sets no cookies at all: no analytics, no advertising, no consent banner needed.",
  alternates: { canonical: "/cookies" },
  openGraph: { url: "/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies"
      intro="Short version: Kilosmith sets no cookies. Not for analytics, not for advertising, not even for a theme preference."
    >
      <section>
        <h2 className="legal-title">What we set</h2>
        <p>
          Nothing. There is no cookie banner on this site because there is nothing to consent to.
          Open your browser&apos;s developer tools, go to Application → Cookies, and the list stays
          empty while you use every tool.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Local storage and IndexedDB</h2>
        <p>
          Kilosmith does not write to <code>localStorage</code>, <code>sessionStorage</code> or{" "}
          <code>IndexedDB</code>. Tool settings such as quality, format and selected presets live in
          React state, which disappears when you close the tab.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Third-party cookies</h2>
        <ul>
          <li>No advertising or retargeting networks.</li>
          <li>No analytics (no Google Analytics, no Plausible, no pixel).</li>
          <li>No social embeds; social links are plain anchors.</li>
          <li>Fonts are self-hosted with the app, not loaded from a font CDN.</li>
        </ul>
      </section>

      <section>
        <h2 className="legal-title">Hosting logs</h2>
        <p>
          The static files are served by a hosting provider, which may keep short-lived access logs
          (IP address, user agent, requested URL) for security and abuse prevention. Those logs are
          server-side records, not cookies, and are never linked to a file you process; no file is
          ever sent.
        </p>
      </section>

      <section>
        <h2 className="legal-title">If this changes</h2>
        <p>
          If a future feature ever needs storage, it will be opt-in and this page will say so,
          plainly, before the feature ships. The date at the top of the page tracks any change.
        </p>
      </section>
    </LegalPage>
  );
}
