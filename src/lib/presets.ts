export type FitMode = "crop" | "pad";

export type Preset = {
  id: string;
  label: string;
  group: GroupId;
  w: number;
  h: number;
  /** Some platforms need transparency (icons), some need a flat background. */
  format?: "jpeg" | "png" | "webp" | "avif";
};

export type GroupId = "social" | "link" | "icon";

export const GROUPS: { id: GroupId; label: string; hint: string }[] = [
  { id: "social", label: "Social", hint: "Posts, stories and covers" },
  { id: "link", label: "Link previews", hint: "Open Graph and cards" },
  { id: "icon", label: "Icons & avatars", hint: "PNG, transparent safe" },
];

export const PRESETS: Preset[] = [
  { id: "ig-post", label: "Instagram post", group: "social", w: 1080, h: 1080 },
  { id: "ig-portrait", label: "Instagram portrait", group: "social", w: 1080, h: 1350 },
  { id: "ig-story", label: "Instagram story", group: "social", w: 1080, h: 1920 },
  { id: "x-post", label: "X post", group: "social", w: 1600, h: 900 },
  { id: "x-header", label: "X header", group: "social", w: 1500, h: 500 },
  { id: "li-post", label: "LinkedIn post", group: "social", w: 1200, h: 627 },
  { id: "li-banner", label: "LinkedIn banner", group: "social", w: 1584, h: 396 },
  { id: "yt-thumb", label: "YouTube thumbnail", group: "social", w: 1280, h: 720 },
  { id: "pin", label: "Pinterest pin", group: "social", w: 1000, h: 1500 },

  { id: "og", label: "OG / link preview", group: "link", w: 1200, h: 630 },
  { id: "og-square", label: "OG square", group: "link", w: 1200, h: 1200 },
  { id: "hero", label: "Site hero", group: "link", w: 1920, h: 1080 },
  { id: "email-header", label: "Email header", group: "link", w: 1200, h: 400 },

  { id: "icon-1024", label: "App icon 1024", group: "icon", w: 1024, h: 1024, format: "png" },
  { id: "icon-512", label: "App icon 512", group: "icon", w: 512, h: 512, format: "png" },
  { id: "icon-180", label: "Apple touch 180", group: "icon", w: 180, h: 180, format: "png" },
  { id: "avatar", label: "Avatar 400", group: "icon", w: 400, h: 400 },
  { id: "favicon-32", label: "Favicon 32", group: "icon", w: 32, h: 32, format: "png" },
];

export const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

export const DEFAULT_SELECTION = [
  "ig-post",
  "ig-portrait",
  "ig-story",
  "x-post",
  "x-header",
  "li-banner",
  "og",
  "icon-1024",
  "avatar",
];

export function presetsByGroup(group: GroupId) {
  return PRESETS.filter((p) => p.group === group);
}
