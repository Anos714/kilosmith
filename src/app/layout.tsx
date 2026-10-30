import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "sizekit — one photo, every size",
  description:
    "Drop one image and get every social, link-preview and icon size, correctly cropped. Batch ZIP or single files. Nothing is uploaded — it all runs in your browser.",
  openGraph: {
    title: "sizekit — one photo, every size",
    description:
      "Every social, OG and icon size from one photo. Correct crops, offline, no account.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
