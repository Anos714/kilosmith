/**
 * Kilosmith resize worker.
 * Plain JS on purpose: it is served from /public so no bundler config can break it.
 *
 * In:  { jobId, file, presets: [{ id, w, h, fit, format }], options: { quality, background, focus } }
 * Out: { type: 'result', jobId, presetId, blob, w, h }
 *      { type: 'done' | 'error', jobId, ... }
 */

const MAX_EDGE = 2600; // every preset is 1920 or smaller
const PROXY_W = 160; // attention map resolution — cheap, but enough to see a face
const CHUNK = 4;

self.onmessage = async (event) => {
  const { jobId, file, presets, options } = event.data || {};
  if (!jobId || !file || !presets) return;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const source = capSource(bitmap);
    const attention = buildAttention(source);
    const focus = options && options.focus;

    const queue = presets.slice();

    while (queue.length) {
      const batch = queue.splice(0, CHUNK);
      const rendered = await Promise.all(
        batch.map((preset) => render(source, attention, preset, options, focus))
      );
      rendered.forEach((result, index) => {
        self.postMessage({
          type: "result",
          jobId,
          presetId: batch[index].id,
          blob: result.blob,
          w: result.w,
          h: result.h,
        });
      });
    }

    self.postMessage({ type: "done", jobId });
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId,
      message: error && error.message ? error.message : "Could not read this image",
    });
  } finally {
    // capSource already closed it when it rescaled; closing twice is a no-op.
    bitmap?.close?.();
  }
};

function capSource(bitmap) {
  const max = Math.max(bitmap.width, bitmap.height);
  if (max <= MAX_EDGE) return bitmap;

  const scale = MAX_EDGE / max;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (typeof bitmap.close === "function") bitmap.close();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Attention map                                                       */
/* ------------------------------------------------------------------ */

function boxBlur(src, w, h, radius) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / span;
      const outIndex = row + Math.min(w - 1, Math.max(0, x - radius));
      const inIndex = row + Math.min(w - 1, Math.max(0, x + radius + 1));
      sum += src[inIndex] - src[outIndex];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / span;
      const outIndex = Math.min(h - 1, Math.max(0, y - radius)) * w + x;
      const inIndex = Math.min(h - 1, Math.max(0, y + radius + 1)) * w + x;
      sum += tmp[inIndex] - tmp[outIndex];
    }
  }

  return out;
}

function sobel(src, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1] +
        src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] +
        src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/**
 * Saliency from four cheap signals:
 *  - fine edges      (detail: eyes, text, texture)
 *  - coarse edges    (large shapes: a face outline, a product silhouette)
 *  - saturation      (color draws the eye)
 *  - skin probability (YCbCr + RGB rules — a cheap stand-in for face detection)
 *
 * If the source has real transparency, alpha becomes the subject mask, which is
 * exactly right for logos and product cut-outs.
 */
function buildAttention(source) {
  const sw = source.width;
  const sh = source.height;
  const pw = Math.min(PROXY_W, sw);
  const ph = Math.max(1, Math.round((sh / sw) * pw));
  const n = pw * ph;

  const canvas = new OffscreenCanvas(pw, ph);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, pw, ph);
  const { data } = ctx.getImageData(0, 0, pw, ph);

  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const skin = new Float32Array(n);
  let transparent = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];

    if (a < 250) transparent++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    sat[i] = max === 0 ? 0 : (max - min) / max;

    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const ycc = cb > 77 && cb < 127 && cr > 133 && cr < 173 && lum[i] > 0.16;
    const rgbRule =
      r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;
    skin[i] = ycc ? (rgbRule ? 1 : 0.55) : 0;
  }

  const useAlpha = transparent > n * 0.03;
  if (useAlpha) {
    for (let i = 0; i < n; i++) skin[i] = 1 - data[i * 4 + 3] / 255;
  }

  const fine = sobel(lum, pw, ph);
  const coarse = sobel(boxBlur(lum, pw, ph, 3), pw, ph);

  const sal = new Float32Array(n);
  let maxSal = 0;

  for (let i = 0; i < n; i++) {
    const value = useAlpha
      ? 0.9 * skin[i] + 0.35 * fine[i] + 0.45 * coarse[i]
      : 0.55 * fine[i] + 0.5 * coarse[i] + 0.25 * sat[i] + 0.75 * skin[i];
    sal[i] = value;
    if (value > maxSal) maxSal = value;
  }

  if (maxSal < 1e-5) {
    sal.fill(1); // flat image — let the center prior decide
    maxSal = 1;
  }
  for (let i = 0; i < n; i++) sal[i] /= maxSal;

  const gathered = boxBlur(sal, pw, ph, 2);
  return {
    pw,
    ph,
    stride: pw + 1,
    integral: integralOf(gathered, pw, ph),
    useAlpha,
  };
}

function integralOf(map, pw, ph) {
  const stride = pw + 1;
  const integral = new Float64Array(stride * (ph + 1));
  for (let y = 0; y < ph; y++) {
    let row = 0;
    for (let x = 0; x < pw; x++) {
      row += map[y * pw + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + row;
    }
  }
  return integral;
}

function regionSum(attention, x0, y0, w, h) {
  if (w <= 0 || h <= 0) return 0;
  const { integral, stride } = attention;
  const x1 = Math.min(attention.pw, x0 + w);
  const y1 = Math.min(attention.ph, y0 + h);
  const a = integral[y0 * stride + x0];
  const b = integral[y0 * stride + x1];
  const c = integral[y1 * stride + x0];
  const d = integral[y1 * stride + x1];
  return d - b - c + a;
}

/* ------------------------------------------------------------------ */
/* Crop selection                                                      */
/* ------------------------------------------------------------------ */

function cropSize(sw, sh, target) {
  const srcAspect = sw / sh;
  if (srcAspect > target) {
    const h = sh;
    return { w: Math.max(1, Math.min(sw, Math.round(sh * target))), h };
  }
  const w = sw;
  return { w, h: Math.max(1, Math.min(sh, Math.round(sw / target))) };
}

function scoreCrop(attention, px, py, winW, winH) {
  let total = regionSum(attention, px, py, winW, winH);

  // Penalise windows whose border slices through content: a face half outside
  // the frame scores worse than the same face fully inside.
  const band = Math.max(1, Math.round(Math.min(winW, winH) * 0.14));
  if (winW > band * 2 + 2 && winH > band * 2 + 2) {
    const inner = regionSum(attention, px + band, py + band, winW - band * 2, winH - band * 2);
    const border = Math.max(0, total - inner);
    total = total - border * 0.55;
  }

  const cx = (px + winW / 2) / attention.pw - 0.5;
  const cy = (py + winH / 2) / attention.ph - 0.5;
  const prior = 1 - 0.5 * (cx * cx + cy * cy);

  return total * prior;
}

function bestCrop(source, attention, preset, focus) {
  const sw = source.width;
  const sh = source.height;
  const { w: cropW, h: cropH } = cropSize(sw, sh, preset.w / preset.h);

  const freeX = sw - cropW;
  const freeY = sh - cropH;
  if (freeX < 2 && freeY < 2) return { sx: 0, sy: 0, sw: cropW, sh: cropH };

  const { pw, ph } = attention;
  const winW = Math.max(2, Math.min(pw, Math.round((cropW / sw) * pw)));
  const winH = Math.max(2, Math.min(ph, Math.round((cropH / sh) * ph)));
  const maxX = Math.max(0, pw - winW);
  const maxY = Math.max(0, ph - winH);

  let bestX = maxX / 2;
  let bestY = maxY / 2;
  let bestScore = -Infinity;

  // A hand-picked focus point wins outright.
  if (focus && Number.isFinite(focus.x) && Number.isFinite(focus.y)) {
    bestX = Math.min(maxX, Math.max(0, Math.round(focus.x * pw - winW / 2)));
    bestY = Math.min(maxY, Math.max(0, Math.round(focus.y * ph - winH / 2)));
  } else {
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const px = Math.round((i / steps) * maxX);
        const py = Math.round((j / steps) * maxY);
        const score = scoreCrop(attention, px, py, winW, winH);
        if (score > bestScore) {
          bestScore = score;
          bestX = px;
          bestY = py;
        }
      }
    }

    // Refine around the winner: three shrinking neighbourhood passes.
    let radius = Math.max(2, Math.round(Math.max(maxX, maxY) / steps));
    for (let pass = 0; pass < 3 && radius >= 1; pass++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const px = Math.min(maxX, Math.max(0, bestX + dx * radius));
          const py = Math.min(maxY, Math.max(0, bestY + dy * radius));
          const score = scoreCrop(attention, px, py, winW, winH);
          if (score > bestScore) {
            bestScore = score;
            bestX = px;
            bestY = py;
          }
        }
      }
      radius = Math.floor(radius / 2);
    }
  }

  return {
    sx: Math.max(0, Math.min(freeX, Math.round((bestX / Math.max(1, maxX)) * freeX))),
    sy: Math.max(0, Math.min(freeY, Math.round((bestY / Math.max(1, maxY)) * freeY))),
    sw: cropW,
    sh: cropH,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/** Halve repeatedly before the final draw — much cleaner than one huge jump. */
function drawRegion(ctx, source, sx, sy, sw, sh, dw, dh) {
  let ratio = sw / Math.max(1, dw);
  if (ratio <= 2.4) {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    return;
  }

  let current = source;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;

  while (cw / 2 > dw * 1.2) {
    const nw = Math.max(dw, Math.round(cw / 2));
    const nh = Math.max(dh, Math.round(ch / 2));
    const temp = new OffscreenCanvas(nw, nh);
    const tctx = temp.getContext("2d");
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(current, cx, cy, cw, ch, 0, 0, nw, nh);
    current = temp;
    cx = 0;
    cy = 0;
    cw = nw;
    ch = nh;
  }

  ctx.drawImage(current, cx, cy, cw, ch, 0, 0, dw, dh);
}

async function render(source, attention, preset, options, focus) {
  const quality = options && typeof options.quality === "number" ? options.quality : 0.9;
  const format = preset.format || "jpeg";
  const type =
    format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : `image/${format}`;

  /**
   * A cut-out with real transparency is almost always a logo or a product shot:
   * cropping it would slice the subject, so give it the whole canvas instead.
   */
  const contain = (preset.fit || "crop") === "pad" || attention.useAlpha;

  const canvas = new OffscreenCanvas(preset.w, preset.h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (contain) {
    const transparent = type === "image/png" && (attention.useAlpha || (options && options.background === "transparent"));
    if (!transparent) {
      ctx.fillStyle = (options && options.background) || "#ffffff";
      ctx.fillRect(0, 0, preset.w, preset.h);
    }
    const scale = Math.min(preset.w / source.width, preset.h / source.height);
    const dw = source.width * scale;
    const dh = source.height * scale;
    ctx.drawImage(source, (preset.w - dw) / 2, (preset.h - dh) / 2, dw, dh);
  } else {
    const crop = bestCrop(source, attention, preset, focus);
    drawRegion(ctx, source, crop.sx, crop.sy, crop.sw, crop.sh, preset.w, preset.h);
  }

  const blob = await canvas.convertToBlob(type === "image/png" ? { type } : { type, quality });

  return { blob, w: preset.w, h: preset.h };
}
