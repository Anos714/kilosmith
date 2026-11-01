import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Everything is public and static, so crawlers get the whole site: including
 * the AI crawlers that power answer engines (GEO). Nothing here needs to be
 * hidden behind a disallow.
 */
export default function robots(): MetadataRoute.Robots {
  const agents = [
    "*",
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "PerplexityBot",
    "Google-Extended",
    "Applebot-Extended",
    "CCBot",
    "Bingbot",
  ];

  return {
    rules: agents.map((userAgent) => ({ userAgent, allow: "/" })),
    sitemap: `${site.domain}/sitemap.xml`,
    host: site.domain,
  };
}
