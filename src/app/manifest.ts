import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name}: ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    id: "/",
    background_color: "#fff9ee",
    theme_color: "#ff5ca8",
    categories: ["photo", "video", "utilities", "productivity"],
    shortcuts: [
      { name: "Compress an image", short_name: "Compress", url: "/#tools" },
      { name: "Trim and compress video", short_name: "Video", url: "/#tools" },
      { name: "Make a GIF", short_name: "GIF", url: "/#tools" },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
