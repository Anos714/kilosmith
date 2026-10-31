import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.domain),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  authors: [{ name: site.author.name, url: site.author.github }],
  creator: site.author.name,
  publisher: site.author.name,
  category: "technology",
  alternates: {
    canonical: "/",
    types: { "text/plain": [{ url: "/llms.txt", title: "llms.txt" }] },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    url: site.domain,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "sizekit — every size, every format, nothing uploaded",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    creator: "@anos714",
    site: "@anos714",
    images: ["/og.png"],
  },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${site.domain}/#app`,
    name: site.name,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any (runs in a web browser)",
    url: site.domain,
    description: site.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Batch image resize with smart crop",
      "Image compression with target size",
      "PNG, JPEG, WebP and AVIF conversion",
      "Browser-side video compression with WebCodecs",
      "Animated GIF maker",
      "Meme maker",
      "Favicon and app icon generator",
      "Everything processed locally, no upload",
    ],
    author: { "@id": `${site.domain}/#author` },
    publisher: { "@id": `${site.domain}/#author` },
    datePublished: site.released,
    isAccessibleForFree: true,
    browserRequirements: "Requires JavaScript. Video compression needs WebCodecs.",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.domain}/#website`,
    name: site.name,
    url: site.domain,
    inLanguage: "en",
    publisher: { "@id": `${site.domain}/#author` },
    about: { "@id": `${site.domain}/#app` },
  },
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${site.domain}/#author`,
    name: site.author.name,
    url: site.author.github,
    email: `mailto:${site.author.email}`,
    jobTitle: "Developer",
    knowsAbout: ["image optimisation", "video encoding", "WebCodecs", "the web platform"],
    sameAs: [site.author.github, site.author.x, site.author.linkedin],
  },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
