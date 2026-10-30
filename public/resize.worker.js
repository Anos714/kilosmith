/**
 * sizekit resize worker.
 * Plain JS on purpose: it is served from /public so no bundler config can break it.
 *
 * In:  { jobId, file, presets: [{ id, w, h, fit, format }], options: { quality, background } }
 * Out: { type: 'result', jobId, presetId, blob, w, h }
 *      { type: 'done' | 'error', jobId, ... }
 */

const MAX_EDGE = 2600; // every preset is 1920 or smaller, so no need to keep more
const PROXY_W = 96;
const CHUNK = 4;

self.onmessage = async (event) => {
  const { jobId, file, presets, options } = event.data || {};
  if (!jobId || !file || !presets) return;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const source = capSource(bitmap);
    const energy = buildEnergy(source);

    const queue = presets.slice();

    while (queue.length) {
      const batch = queue.splice(0, CHUNK);
      const rendered = await Promise.all(
        batch.map((preset) => render(source, energy, preset, options))
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

    if (typeof bitmap.close === "function" && source !== bitmap) bitmap.close();
    self.postMessage({ type: "done", jobId });
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId,
      message: error && error.message ? error.message : "Could not read this image",
    });
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

/**
 * Cheap saliency: sobel energy on a 96px proxy, summed through an integral
 * image. Runs in ~3ms even for a 40MP photo, because it never touches full res.
 */
function buildEnergy(source) {
  const sw = source.width;
  const sh = source.height;
  const pw = Math.min(PROXY_W, sw);
  const ph = Math.max(1, Math.round((sh / sw) * pw));

  const canvas = new OffscreenCanvas(pw, ph);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, pw, ph);
  const { data } = ctx.getImageData(0, 0, pw, ph);

  const lum = new Float32Array(pw * ph);
  for (let i = 0; i < pw * ph; i++) {
    const o = i * 4;
    lum[i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
  }

  const raw = new Float32Array(pw * ph);
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      const i = y * pw + x;
      const gx =
        -lum[i - pw - 1] - 2 * lum[i - 1] - lum[i + pw - 1] +
        lum[i - pw + 1] + 2 * lum[i + 1] + lum[i + pw + 1];
      const gy =
        -lum[i - pw - 1] - 2 * lum[i - pw] - lum[i - pw + 1] +
        lum[i + pw - 1] + 2 * lum[i + pw] + lum[i + pw + 1];
      raw[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // 3x3 gather so a window over a face beats a window over flat sky.
  const smooth = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ph) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= pw) continue;
          sum += raw[yy * pw + xx];
          n++;
        }
      }
      smooth[y * pw + x] = sum / n;
    }
  }

  const stride = pw + 1;
  const integral = new Float64Array(stride * (ph + 1));
  for (let y = 0; y < ph; y++) {
    let row = 0;
    for (let x = 0; x < pw; x++) {
      row += smooth[y * pw + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + row;
    }
  }

  return { pw, ph, integral, stride };
}

function windowScore(map, x0, y0, w, h) {
  const { integral, stride } = map;
  const a = integral[y0 * stride + x0];
  const b = integral[y0 * stride + x0 + w];
  const c = integral[(y0 + h) * stride + x0];
  const d = integral[(y0 + h) * stride + x0 + w];
  return d - b - c + a;
}

function bestCrop(source, energy, preset) {
  const sw = source.width;
  const sh = source.height;
  const target = preset.w / preset.h;
  const srcAspect = sw / sh;

  let cropW;
  let cropH;
  if (srcAspect > target) {
    cropH = sh;
    cropW = Math.round(sh * target);
  } else {
    cropW = sw;
    cropH = Math.round(sw / target);
  }
  cropW = Math.max(1, Math.min(sw, cropW));
  cropH = Math.max(1, Math.min(sh, cropH));

  const freeX = sw - cropW;
  const freeY = sh - cropH;
  if (freeX < 2 && freeY < 2) return { sx: 0, sy: 0, sw: cropW, sh: cropH };

  const { pw, ph } = energy;
  const winW = Math.max(2, Math.min(pw, Math.round((cropW / sw) * pw)));
  const winH = Math.max(2, Math.min(ph, Math.round((cropH / sh) * ph)));
  const steps = 14;

  let best = -1;
  let bx = 0.5;
  let by = 0.5;

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const px = Math.round((i / steps) * (pw - winW));
      const py = Math.round((j / steps) * (ph - winH));
      const energyScore = windowScore(energy, px, py, winW, winH);

      const cx = (px + winW / 2) / pw - 0.5;
      const cy = (py + winH / 2) / ph - 0.5;
      const centerBias = 1 - 0.5 * (cx * cx + cy * cy);

      const score = energyScore * centerBias;
      if (score > best) {
        best = score;
        bx = (px / pw) * sw;
        by = (py / ph) * sh;
      }
    }
  }

  const sx = Math.max(0, Math.min(freeX, Math.round(bx)));
  const sy = Math.max(0, Math.min(freeY, Math.round(by)));
  return { sx, sy, sw: cropW, sh: cropH };
}

async function render(source, energy, preset, options) {
  const quality = options && typeof options.quality === "number" ? options.quality : 0.9;
  const fit = preset.fit || "crop";
  const type = preset.format === "png" ? "image/png" : "image/jpeg";

  const canvas = new OffscreenCanvas(preset.w, preset.h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (fit === "pad") {
    const bg = options && options.background ? options.background : "#0b0c0e";
    if (!(type === "image/png" && bg === "transparent")) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, preset.w, preset.h);
    }
    const scale = Math.min(preset.w / source.width, preset.h / source.height);
    const dw = source.width * scale;
    const dh = source.height * scale;
    ctx.drawImage(source, (preset.w - dw) / 2, (preset.h - dh) / 2, dw, dh);
  } else {
    const crop = bestCrop(source, energy, preset);
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, preset.w, preset.h);
  }

  const blob = await canvas.convertToBlob(
    type === "image/png" ? { type } : { type, quality }
  );

  return { blob, w: preset.w, h: preset.h };
}
