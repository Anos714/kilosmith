import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(`${site.released}T00:00:00Z`);

  const pages = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/refunds", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/cookies", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  return pages.map((page) => ({
    url: `${site.domain}${page.path}`,
    lastModified: updated,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
