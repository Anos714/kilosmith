import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Kilosmith processes every file on your device. No uploads, no accounts, no analytics, no tracking pixels.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="The short version: your files never leave your device. There is no upload endpoint, no account and no analytics to opt out of."
    >
      <section>
        <h2 className="legal-title">What we collect</h2>
        <p>
          Nothing that identifies you. Kilosmith has no user accounts, no sign-in, no cookies for
          advertising and no analytics script. We do not log filenames, image contents, video
          contents or processing history.
        </p>
      </section>

      <section>
        <h2 className="legal-title">How files are processed</h2>
        <p>
          Images are decoded by your browser&apos;s built-in image decoder and re-encoded with its
          encoder. Video is decoded and encoded with WebCodecs on your own GPU, then muxed into an
          MP4 in memory. GIFs, memes and favicons are built on a canvas in the tab. At no point is
          a file sent over the network.
        </p>
        <p>
          You can verify this: open your browser&apos;s developer tools, switch to the Network panel and
          use any tool. No request carries your file.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Hosting and server logs</h2>
        <p>
          The site is served as static files by a hosting provider. Like any web host, that provider
          may keep short-lived access logs (IP address, user agent, requested URL) for security and
          abuse prevention. Those logs are not linked to any file you process, because no file is
          ever sent.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Local storage</h2>
        <p>
          Kilosmith does not write to cookies, localStorage or IndexedDB. Tool settings live in
          memory and disappear when you close the tab.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Third parties</h2>
        <ul>
          <li>No advertising networks.</li>
          <li>No analytics providers.</li>
          <li>No social embeds or tracking pixels.</li>
          <li>Fonts are self-hosted with the app, not fetched from a font CDN.</li>
        </ul>
      </section>

      <section>
        <h2 className="legal-title">Children</h2>
        <p>
          Kilosmith is a general-purpose utility and is not directed at children under 13. Because no
          personal data is collected, there is nothing to delete on request.
        </p>
      </section>

      <section>
        <h2 className="legal-title">Changes</h2>
        <p>
          If this policy changes, the date at the top of the page changes with it. Material changes
          will be noted in the project&apos;s public repository.
        </p>
      </section>
    </LegalPage>
  );
}
