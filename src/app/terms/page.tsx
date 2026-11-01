import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Kilosmith, a free browser-based image and video toolkit.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="Kilosmith is free software you run in your browser. These terms are short because the relationship is simple."
    >
      <section>
        <h2 className="legal-title">1. What you may use it for</h2>
        <p>
          Anything lawful. Resize product photos, compress client videos, build memes, ship favicons.
          Personal and commercial use are both fine, with no attribution required.
        </p>
      </section>

      <section>
        <h2 className="legal-title">2. Your files stay yours</h2>
        <p>
          We claim no licence over any file you process. Because nothing is uploaded, we never hold
          a copy and cannot lose, sell or inspect one.
        </p>
      </section>

      <section>
        <h2 className="legal-title">3. Your part</h2>
        <ul>
          <li>Only process files you have the right to use.</li>
          <li>Keep your own backups; output quality depends on your browser&apos;s encoders.</li>
          <li>Do not use the site to break the law or infringe someone else&apos;s rights.</li>
        </ul>
      </section>

      <section>
        <h2 className="legal-title">4. No warranty</h2>
        <p>
          Kilosmith is provided “as is”, without warranty of any kind. A browser update, a missing
          codec or a very large file can make a tool fail. Verify important output before you rely
          on it.
        </p>
      </section>

      <section>
        <h2 className="legal-title">5. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, the author is not liable for indirect or
          consequential damages, including lost files or lost revenue, arising from use of the
          site.
        </p>
      </section>

      <section>
        <h2 className="legal-title">6. Availability</h2>
        <p>
          The site is offered free of charge and may change or disappear at any time. Once a page
          has loaded it keeps working without the server, which is the closest thing to a guarantee
          we can make.
        </p>
      </section>

      <section>
        <h2 className="legal-title">7. Governing law</h2>
        <p>
          These terms are governed by the laws of India, without regard to conflict-of-law rules.
        </p>
      </section>
    </LegalPage>
  );
}
