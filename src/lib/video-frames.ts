/**
 * Pull stills out of a video, for the GIF maker.
 *
 * The tab's own decoder does the work (`<video>` + canvas seeks) instead of
 * WebCodecs: it accepts every container the browser can play — MP4, WebM, MOV —
 * with no demuxing or codec probing, and a GIF only ever needs a handful of
 * frames per second, so seek-by-seek is plenty fast.
 */

export type ClipInfo = {
  duration: number;
  width: number;
  height: number;
};

export type GrabOptions = {
  /** Trim range in seconds. */
  start: number;
  end: number;
  /** Frames to keep per second of clip. */
  fps: number;
  onProgress?: (done: number, total: number) => void;
  /** Turn true to abandon the run; the loop stops before the next frame. */
  cancelled?: () => boolean;
};

export type GrabbedFrame = { blob: Blob; time: number };

/** The GIF tool's widest output, so grabbing bigger would just be memory. */
export const GRAB_MAX_EDGE = 1280;
/** A hard stop: a 400-frame grab already means hundreds of decodes and seeks. */
export const GRAB_FRAME_CAP = 400;

const OPEN_TIMEOUT = 20_000;
const SEEK_TIMEOUT = 15_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A video element parked on `src`, plus the one call that releases it. */
function openClip(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const dispose = () => {
    video.removeAttribute("src");
    // Tells the browser to drop its decoders now instead of at garbage
    // collection — a held decoder is hundreds of megabytes for a 4K file.
    video.load();
    URL.revokeObjectURL(url);
  };

  return { video, dispose };
}

/** Wait for one event, or give up with a message a person can act on. */
function waitFor(video: HTMLVideoElement, event: string, timeout: number, message: string) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(message));
    }, timeout);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This file is not a video the browser can read"));
    };
    video.addEventListener(event, onEvent);
    video.addEventListener("error", onError);
  });
}

/**
 * Some WebMs are written without a duration header and report Infinity until
 * the end has been touched, so seek far past it (the browser clamps) and let
 * the resulting `seeked` fill the real length in.
 */
function nudgeForDuration(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = window.setTimeout(done, 5_000);
    video.addEventListener("seeked", done);
    try {
      video.currentTime = 1e9;
    } catch {
      done();
    }
  });
}

async function readDuration(video: HTMLVideoElement) {
  if (video.readyState < 1) {
    await waitFor(video, "loadedmetadata", OPEN_TIMEOUT, "This video took too long to open");
  }
  let duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    await nudgeForDuration(video);
    duration = video.duration;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("This video doesn't report a length the browser can read");
  }
  return duration;
}

/** Read a clip's length and size without decoding a single frame. */
export async function probeClip(file: File): Promise<ClipInfo> {
  const { video, dispose } = openClip(file);
  try {
    const duration = await readDuration(video);
    if (!(video.videoWidth > 0) || !(video.videoHeight > 0)) {
      throw new Error("This video has no readable picture size");
    }
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    dispose();
  }
}

/** Jump to `time` and wait for the frame to actually be there. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  // Assigning the time you are already parked on is a no-op that never fires
  // `seeked` — resolve directly instead of hanging on the timeout.
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video stopped responding to seeks"));
    }, SEEK_TIMEOUT);
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This file is not a video the browser can read"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = time;
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Could not move through this video"));
    }
  });
}

/**
 * Decode the frames between `start` and `end` at `fps` and hand them back as
 * JPEG blobs, downscaled to `GRAB_MAX_EDGE` on the long edge. Returns partial
 * results if `cancelled` fires, so the caller can throw them away.
 */
export async function grabVideoFrames(file: File, options: GrabOptions): Promise<GrabbedFrame[]> {
  const fps = Number.isFinite(options.fps) && options.fps > 0 ? options.fps : 12;
  const { video, dispose } = openClip(file);

  try {
    const duration = await readDuration(video);
    const start = clamp(options.start, 0, Math.max(0, duration - 0.02));
    const end = clamp(options.end, start + 0.05, duration);

    const wanted = Math.ceil((end - start) * fps);
    if (wanted > GRAB_FRAME_CAP) {
      throw new Error(
        `That's ${wanted} frames — grab at most ${GRAB_FRAME_CAP}. Shorten the clip or drop the frame rate.`
      );
    }
    const total = Math.max(1, wanted);

    if (!(video.videoWidth > 0) || !(video.videoHeight > 0)) {
      throw new Error("This video has no readable picture size");
    }
    // Real pixels before the first draw: seeking from metadata-only state
    // would leave the canvas blank.
    if (video.readyState < 2) {
      await waitFor(video, "loadeddata", OPEN_TIMEOUT, "This video took too long to show a frame");
    }

    const scale = Math.min(1, GRAB_MAX_EDGE / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";

    const frames: GrabbedFrame[] = [];
    for (let index = 0; index < total; index++) {
      if (options.cancelled?.()) break;
      // Tail frames can pile up on the same instant; duplicating the last
      // picture keeps the loop length honest rather than ending early.
      const target = Math.min(start + index / fps, Math.max(0, duration - 0.01));
      await seek(video, target);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("A frame could not be read from this video");
      frames.push({ blob, time: video.currentTime });
      options.onProgress?.(index + 1, total);
    }
    return frames;
  } finally {
    dispose();
  }
}
