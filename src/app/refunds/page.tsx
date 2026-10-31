import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";

export const metadata: Metadata = {
  title: "Refunds",
  description:
    "sizekit is free. If you ever pay for a future optional extra, this is the refund policy that applies.",
  alternates: { canonical: "/refunds" },
  openGraph: { url: "/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds"
      intro="Right now every tool on sizekit is free, so there is nothing to refund. This page covers the optional paid extras that may ship later."
    >
      <section>
        <h2>Free tools</h2>
        <p>
          Resize, compress, convert, video, GIF, meme and favicon tools cost nothing. No card, no
          trial, no expiry.
        </p>
      </section>

      <section>
        <h2>If you buy an optional extra</h2>
        <p>
          Any future one-time purchase (for example a desktop build or a batch helper) comes with a{" "}
          <strong className="text-zinc-200">14-day, no-questions refund</strong>. Email the address
          below with the receipt and you get the full amount back to the original payment method.
        </p>
        <ul>
          <li>No restocking fee.</li>
          <li>No “you used it” clause.</li>
          <li>No subscription to cancel, ever.</li>
        </ul>
      </section>

      <section>
        <h2>How to request one</h2>
        <p>
          Send the order email or receipt to the address at the bottom of this page with the subject
          line “refund”. Refunds are processed within 5 business days; your bank may take a few
          days more to show it.
        </p>
      </section>

      <section>
        <h2>Chargebacks</h2>
        <p>
          Please email first. A chargeback usually costs more in fees than the product costs, and a
          plain email resolves it faster for both of us.
        </p>
      </section>
    </LegalPage>
  );
}
