import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { site } from "@/lib/site";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";

const mona = localFont({
  src: "./fonts/MonaSans.woff2",
  variable: "--font-mona",
  display: "swap",
  weight: "200 900",
  style: "normal",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});

const fredoka = localFont({
  src: "./fonts/Fredoka-latin.woff2",
  variable: "--font-fredoka",
  display: "swap",
  weight: "300 700",
  style: "normal",
  fallback: ["ui-rounded", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.domain),
  title: {
    default: `${site.name}: heavy files, made light`,
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
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Kilosmith: heavy files, made light. Image and video tools that run in your browser.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
    creator: "@RahulSain714",
    site: "@RahulSain714",
    images: ["/og.png"],
  },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#fff9ee",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${site.domain}/#app`,
    name: site.name,
    alternateName: "Kilosmith image and video toolkit",
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Image and video utilities",
    operatingSystem: "Any (runs in a web browser)",
    url: site.domain,
    description: site.description,
    image: `${site.domain}/og.png`,
    screenshot: `${site.domain}/og.png`,
    softwareVersion: "1.0",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    featureList: [
      "Batch image resize with smart crop",
      "Crop, rotate, flip and straighten",
      "Image compression with target size",
      "PNG, JPEG, WebP and AVIF conversion",
      "Browser-side video compression and trimming with WebCodecs",
      "Animated GIF maker",
      "Meme maker with 200 templates",
      "Favicon and app icon generator",
      "Everything processed locally, no upload",
    ],
    author: { "@id": `${site.domain}/#author` },
    publisher: { "@id": `${site.domain}/#author` },
    brand: { "@type": "Brand", name: site.name },
    datePublished: site.released,
    dateModified: site.updated,
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
    <html lang="en" className={`${mona.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        {/* Cookieless, anonymous page views — no file data, ever. */}
        <Analytics />
      </body>
    </html>
  );
}
