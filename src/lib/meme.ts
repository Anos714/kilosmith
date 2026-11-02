/**
 * Meme rendering. Kept pure so the same code paints the on-screen preview and
 * the full-resolution export. The preview never has to be scaled up.
 */

export type MemeFont = "impact" | "grotesk" | "serif" | "mono" | "comic" | "slab";

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
  // System stacks only — the privacy promise says no font ever loads from a CDN.
  comic: {
    label: "Comic",
    stack: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", "Segoe Print", cursive',
    leading: 1.14,
  },
  slab: {
    label: "Slab",
    stack: 'Rockwell, "Roboto Slab", "Bookman Old Style", Georgia, serif',
    leading: 1.12,
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
  /** Tilt in degrees, -45..45. */
  rotate: number;
  /** Rounded highlight bar painted behind every line. */
  backingOn: boolean;
  backing: string;
  /** Soft drop shadow under the glyphs. */
  shadowOn: boolean;
  shadow: string;
};

export type StrokeTool = "pen" | "marker" | "box" | "arrow";

/**
 * One drawn mark. `points` are flat normalised pairs: a box or arrow keeps
 * exactly two (start, current), a freehand line as many as the hand made.
 * `width` is canvas pixels, so the preview and the export match exactly.
 */
export type Stroke = {
  id: string;
  tool: StrokeTool;
  color: string;
  width: number;
  points: number[];
};

export type Sticker = {
  id: string;
  char: string;
  /** Centre, 0..1 of the canvas. */
  x: number;
  y: number;
  /** Size as a fraction of canvas height. */
  size: number;
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
    rotate: 0,
    backingOn: false,
    backing: "#ffe66d",
    shadowOn: false,
    shadow: "#000000",
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

/* --------------------------------- strokes -------------------------------- */

/** Rounded highlight bar behind a line of text. */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.restore();
}

/** Paint one stroke onto an already-positioned context. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number
) {
  const pts = stroke.points;
  if (pts.length < 4) return;

  const base = Math.max(1, stroke.width);
  const x0 = pts[0] * width;
  const y0 = pts[1] * height;
  const x1 = pts[pts.length - 2] * width;
  const y1 = pts[pts.length - 1] * height;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "box") {
    ctx.lineWidth = base;
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  } else if (stroke.tool === "arrow") {
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = Math.max(10, base * 3.2);
    const spread = 0.44;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(angle - spread), y1 - head * Math.sin(angle - spread));
    ctx.lineTo(x1 - head * Math.cos(angle + spread), y1 - head * Math.sin(angle + spread));
    ctx.closePath();
    ctx.fill();
  } else {
    if (stroke.tool === "marker") {
      // Highlighter logic: wide and translucent, so crossings darken naturally.
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = base * 2.6;
    } else {
      ctx.lineWidth = base;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i] * width, pts[i + 1] * height);
    ctx.stroke();
  }

  ctx.restore();
}

/** The clickable box around a stroke: its points, padded by the brush size. */
export function strokeRect(stroke: Stroke, width: number, height: number): BoxRect {
  const pts = stroke.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i] * width;
    const y = pts[i + 1] * height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { id: stroke.id, x: 0, y: 0, w: 0, h: 0 };

  const base = Math.max(1, stroke.width);
  const pad =
    (stroke.tool === "marker" ? base * 1.4 : base) +
    (stroke.tool === "arrow" ? Math.max(10, base * 3.2) : 0) +
    4;
  return {
    id: stroke.id,
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

/* ---------------------------------- draw ---------------------------------- */

const EMOJI_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

export function drawMeme(
  ctx: CanvasRenderingContext2D,
  options: {
    width: number;
    height: number;
    image?: CanvasImageSource | null;
    fit?: "cover" | "contain";
    background?: string;
    texts: MemeText[];
    strokes?: Stroke[];
    stickers?: Sticker[];
    activeId?: string | null;
    guides?: boolean;
  }
): BoxRect[] {
  const { width, height, image, texts, activeId, guides = false } = options;
  const strokes = options.strokes ?? [];
  const stickers = options.stickers ?? [];
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

  // Rects come back bottom-to-top: strokes, then captions, then stickers, so a
  // reversed hit-test finds whatever sits visually on top.
  const rects: BoxRect[] = [];

  for (const stroke of strokes) {
    paintStroke(ctx, stroke, width, height);
    rects.push(strokeRect(stroke, width, height));
  }

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
    const angle = clamp(item.rotate, -45, 45) * (Math.PI / 180);
    const blockCenterY = top + blockHeight / 2;

    ctx.save();
    if (angle) {
      ctx.translate(centerX, blockCenterY);
      ctx.rotate(angle);
      ctx.translate(-centerX, -blockCenterY);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, size / 8);

    lines.forEach((line, index) => {
      const baseline = top + lineHeight * (index + 0.82);
      const lineW = ctx.measureText(line).width;

      if (item.backingOn && line) {
        const padX = size * 0.16;
        fillRoundRect(
          ctx,
          centerX - lineW / 2 - padX,
          top + index * lineHeight + size * 0.05,
          lineW + padX * 2,
          Math.max(size * 0.6, lineHeight - size * 0.1),
          size * 0.18,
          item.backing
        );
      }

      if (item.shadowOn) {
        ctx.shadowColor = item.shadow;
        ctx.shadowBlur = size * 0.18;
        ctx.shadowOffsetX = size * 0.07;
        ctx.shadowOffsetY = size * 0.09;
      }
      if (item.outlineOn) {
        ctx.strokeStyle = item.outline;
        ctx.strokeText(line, centerX, baseline);
      }
      ctx.fillStyle = item.color;
      ctx.fillText(line, centerX, baseline);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });

    ctx.restore();

    let rect: BoxRect = {
      id: item.id,
      x: centerX - widest / 2,
      y: top,
      w: widest,
      h: blockHeight,
    };
    if (angle) {
      // A tilted caption's hit box is the axis-aligned bounds of its corners,
      // so grabbing a rotated end still works.
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const xs: number[] = [];
      const ys: number[] = [];
      const corners = [
        [rect.x, rect.y],
        [rect.x + rect.w, rect.y],
        [rect.x + rect.w, rect.y + rect.h],
        [rect.x, rect.y + rect.h],
      ];
      for (const [ox, oy] of corners) {
        const dx = ox - centerX;
        const dy = oy - blockCenterY;
        xs.push(centerX + dx * cos - dy * sin);
        ys.push(blockCenterY + dx * sin + dy * cos);
      }
      const nx = Math.min(...xs);
      const ny = Math.min(...ys);
      rect = { id: item.id, x: nx, y: ny, w: Math.max(...xs) - nx, h: Math.max(...ys) - ny };
    }
    rects.push(rect);
  }

  for (const sticker of stickers) {
    const sizePx = clamp(sticker.size, 0.02, 0.6) * height;
    const cx = clamp(sticker.x, 0, 1) * width;
    const cy = clamp(sticker.y, 0, 1) * height;
    ctx.save();
    ctx.font = `400 ${sizePx}px ${EMOJI_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.max(sizePx * 0.7, ctx.measureText(sticker.char).width);
    const h = sizePx * 1.2;
    ctx.fillText(sticker.char, cx, cy);
    ctx.restore();
    rects.push({ id: sticker.id, x: cx - w / 2, y: cy - h / 2, w, h });
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
