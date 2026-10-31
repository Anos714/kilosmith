/**
 * Meme rendering. Kept pure so the same code paints the on-screen preview and
 * the full-resolution export — the preview never has to be scaled up.
 */

export type MemeFont = "impact" | "grotesk" | "serif" | "mono";

export const MEME_FONTS: Record<MemeFont, { label: string; stack: string; leading: number }> = {
  impact: {
    label: "Impact",
    stack: 'Impact, "Anton", "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif',
    leading: 1.02,
  },
  grotesk: {
    label: "Grotesk",
    stack: '"Arial Black", "Helvetica Neue", Helvetica, Inter, system-ui, sans-serif',
    leading: 1.12,
  },
  serif: {
    label: "Serif",
    stack: 'Georgia, "Times New Roman", Times, serif',
    leading: 1.14,
  },
  mono: {
    label: "Mono",
    stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    leading: 1.16,
  },
};

export type MemeAnchor = "top" | "middle" | "bottom";

export type MemeText = {
  id: string;
  text: string;
  /** Centre of the block, 0..1 of the canvas width. */
  x: number;
  /** Anchor line, 0..1 of the canvas height. */
  y: number;
  anchor: MemeAnchor;
  /** Manual size as a fraction of canvas height (0.03..0.4). */
  size: number;
  auto: boolean;
  font: MemeFont;
  upper: boolean;
  color: string;
  outline: string;
  outlineOn: boolean;
};

export type BoxRect = { id: string; x: number; y: number; w: number; h: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

let counter = 0;
const nextId = () => `t${++counter}`;

function make(partial: Partial<MemeText> & { y: number; anchor: MemeAnchor }): MemeText {
  return {
    id: nextId(),
    text: "",
    x: 0.5,
    size: 0.11,
    auto: true,
    font: "impact",
    upper: true,
    color: "#ffffff",
    outline: "#000000",
    outlineOn: true,
    ...partial,
  };
}

/**
 * Caption slots for a template. `boxes` comes from the template metadata, so
 * "Two Buttons" starts with three slots and "Drake" with two.
 */
export function defaultTexts(boxes = 2): MemeText[] {
  if (boxes <= 1) return [make({ y: 0.5, anchor: "middle" })];
  return Array.from({ length: Math.min(boxes, 5) }, (_, index) => {
    const slot = index / (boxes - 1);
    if (index === 0) return make({ y: 0.06, anchor: "top" });
    if (index === boxes - 1) return make({ y: 0.96, anchor: "bottom" });
    return make({ y: clamp(0.06 + slot * 0.9, 0.2, 0.8), anchor: "middle" });
  });
}

export function newText(existing: MemeText[]): MemeText {
  const y = 0.5 + ((existing.length % 3) - 1) * 0.12;
  return make({ y: clamp(y, 0.15, 0.85), anchor: "middle" });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

const sizeCache = new Map<string, number>();

/** Largest size where the block still fits the width and stays within 3 lines. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  stack: string,
  maxWidth: number,
  maxSize: number,
  maxLines = 3
) {
  let low = 10;
  let high = maxSize;
  let best = low;
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    ctx.font = `900 ${mid}px ${stack}`;
    const lines = wrapLines(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (lines.length <= maxLines && widest <= maxWidth) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
}

/**
 * `fitSize` runs a 12-step binary search with a measure per step, which is
 * wasted work while a caption is being dragged. Cache per text/font/metrics.
 */
function fitSizeCached(
  ctx: CanvasRenderingContext2D,
  text: string,
  stack: string,
  maxWidth: number,
  maxSize: number
) {
  const key = `${stack}|${Math.round(maxWidth)}|${Math.round(maxSize)}|${text}`;
  const hit = sizeCache.get(key);
  if (hit !== undefined) return hit;
  const size = fitSize(ctx, text, stack, maxWidth, maxSize);
  if (sizeCache.size > 400) sizeCache.clear();
  sizeCache.set(key, size);
  return size;
}

export function drawMeme(
  ctx: CanvasRenderingContext2D,
  options: {
    width: number;
    height: number;
    image?: CanvasImageSource | null;
    fit?: "cover" | "contain";
    background?: string;
    texts: MemeText[];
    activeId?: string | null;
    guides?: boolean;
  }
): BoxRect[] {
  const { width, height, image, texts, activeId, guides = false } = options;
  const fit = options.fit ?? "cover";
  const background = options.background ?? "#0b0d10";

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  if (image) {
    const source = image as CanvasImageSource & { width?: number; height?: number };
    const iw = source.width ?? width;
    const ih = source.height ?? height;
    const scale = fit === "cover" ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }

  const rects: BoxRect[] = [];

  for (const item of texts) {
    const content = (item.upper ? item.text.toUpperCase() : item.text).trim();
    if (!content) continue;

    const font = MEME_FONTS[item.font];
    const maxWidth = width * 0.92;
    const size = item.auto
      ? fitSizeCached(ctx, content, font.stack, maxWidth, height * 0.145)
      : clamp(item.size, 0.03, 0.4) * height;

    ctx.font = `900 ${size}px ${font.stack}`;
    const lines = wrapLines(ctx, content, maxWidth);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const lineHeight = size * font.leading;
    const blockHeight = lines.length * lineHeight;

    let top: number;
    if (item.anchor === "top") top = item.y * height;
    else if (item.anchor === "bottom") top = item.y * height - blockHeight;
    else top = item.y * height - blockHeight / 2;

    const centerX = clamp(item.x, 0.05, 0.95) * width;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, size / 8);

    lines.forEach((line, index) => {
      const baseline = top + lineHeight * (index + 0.82);
      if (item.outlineOn) {
        ctx.strokeStyle = item.outline;
        ctx.strokeText(line, centerX, baseline);
      }
      ctx.fillStyle = item.color;
      ctx.fillText(line, centerX, baseline);
    });

    rects.push({
      id: item.id,
      x: centerX - widest / 2,
      y: top,
      w: widest,
      h: blockHeight,
    });
  }

  if (guides && activeId) {
    const rect = rects.find((entry) => entry.id === activeId);
    if (rect) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(216,255,62,0.85)";
      ctx.strokeRect(rect.x - 12, rect.y - 10, rect.w + 24, rect.h + 20);
      ctx.restore();
    }
  }

  ctx.restore();
  return rects;
}

const TAGS: { id: string; label: string; match: RegExp }[] = [
  {
    id: "classic",
    label: "Classic",
    match: /drake|distracted|galaxy brain|two buttons|woman yelling|this is fine|change my mind|expanding brain|uno draw|bernie|squidward|spiderman/i,
  },
  {
    id: "reaction",
    label: "Reaction",
    match: /shock|surpris|confus|scream|smil|laugh|cry|sad|angry|face|stare|suspicious|disaster|panic|side eye|no idea|thinking|disappoint/i,
  },
  {
    id: "animals",
    label: "Animals",
    match: /cat|dog|frog|bird|monkey|bear|horse|fish|kitten|puppy|penguin|hamster|duck|otter|seal|sloth|animal/i,
  },
  {
    id: "work",
    label: "Work",
    match: /work|office|boss|job|meeting|code|computer|programmer|coffee|monday|deadline|boardroom|corporate|business|exam|school/i,
  },
  {
    id: "screen",
    label: "Screens",
    match: /movie|tv |star wars|harry potter|lord of the rings|friends|breaking bad|simpsons|spongebob|anime|naruto|pokemon|batman|marvel|avengers|matrix|anakin|obi|yoda|morpheus|thanos|joker|kermit|grus|gru |minion|shrek|toy story/i,
  },
];

export const MEME_TAGS = TAGS.map(({ id, label }) => ({ id, label }));

export function matchesTag(name: string, tag: string): boolean {
  if (tag === "all") return true;
  const rule = TAGS.find((entry) => entry.id === tag);
  return rule ? rule.match.test(name) : true;
}
