export const site = {
  name: "sizekit",
  domain: "https://sizekit.vercel.app",
  tagline: "Every size. Every format. Nothing uploaded.",
  description:
    "sizekit is a free browser toolkit for images and video: resize to 18 social and app presets, compress, convert between PNG, WebP, AVIF and JPEG, make GIFs and memes, generate favicons, and shrink video — all locally, with no upload and no account.",
  keywords: [
    "image resizer",
    "compress image online",
    "convert png to webp",
    "png to avif",
    "video compressor",
    "gif maker",
    "meme maker",
    "favicon generator",
    "offline image tools",
    "no upload image editor",
  ],
  author: {
    name: "Rahul Sain",
    email: "hello@sizekit.app",
    github: "https://github.com/Anos714",
    x: "https://x.com/anos714",
    linkedin: "https://www.linkedin.com/in/rahul-sain",
  },
  social: [
    { label: "GitHub", href: "https://github.com/Anos714", handle: "@Anos714" },
    { label: "X", href: "https://x.com/anos714", handle: "@anos714" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/rahul-sain", handle: "Rahul Sain" },
  ],
  released: "2026-10-30",
  year: 2026,
} as const;

export const tools = [
  {
    id: "resize",
    name: "Resize",
    blurb: "One photo into 18 social, OG and icon sizes with smart crops.",
    icon: "resize",
  },
  {
    id: "compress",
    name: "Compress",
    blurb: "Cut image weight with a live before/after and a target size.",
    icon: "compress",
  },
  {
    id: "convert",
    name: "Convert",
    blurb: "PNG, JPEG, WebP and AVIF — batch, with alpha handled correctly.",
    icon: "convert",
  },
  {
    id: "video",
    name: "Video",
    blurb: "Re-encode video in your browser. Pick quality, watch the size drop.",
    icon: "video",
  },
  {
    id: "gif",
    name: "GIF",
    blurb: "Turn a handful of stills into a looping GIF with its own palette.",
    icon: "gif",
  },
  {
    id: "meme",
    name: "Meme",
    blurb: "Top and bottom text, real impact outline, instant export.",
    icon: "meme",
  },
  {
    id: "favicon",
    name: "Favicon",
    blurb: "A complete icon kit: ICO, PNG sizes and a manifest.json.",
    icon: "favicon",
  },
] as const;

export type ToolId = (typeof tools)[number]["id"];
