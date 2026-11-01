import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  createFile,
  DataStream,
  Endianness,
  type Movie,
  type MP4BoxBuffer,
  type Sample,
} from "mp4box";

export type VideoProbe = {
  duration: number;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  rotated: boolean;
  audio: boolean;
};

export type VideoOptions = {
  quality: number; // 1..100
  maxHeight: number; // 0 = keep original
  keepAudio: boolean;
  /** Trim range in seconds. Omit to keep the whole clip. */
  start?: number;
  end?: number;
};

export type VideoProgress = {
  phase: "demux" | "video" | "audio" | "mux";
  done: number;
  total: number;
  note?: string;
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** A number the caller can trust: browsers hand back Infinity/NaN for odd files. */
function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number, fallback: number) {
  const next = finite(value, fallback);
  return Math.min(max, Math.max(min, next));
}

/** AAC encoding is platform-dependent: Chrome on Linux often has no encoder. */
export async function canEncodeAac(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    return !!support.supported;
  } catch {
    return false;
  }
}

export function canUseWebCodecs() {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

export async function probeVideo(file: File): Promise<VideoProbe> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;

  try {
    const meta = await new Promise<{ duration: number; width: number; height: number }>(
      (resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error("This video took too long to open. Try another file.")),
          20_000
        );
        const settle = (result: { duration: number; width: number; height: number }) => {
          window.clearTimeout(timer);
          resolve(result);
        };
        video.onloadedmetadata = () =>
          settle({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        video.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("This file is not a video the browser can read"));
        };
      }
    );

    // Some containers report Infinity (or nothing at all) until fully buffered.
    const duration = finite(meta.duration, 0);
    if (!(duration > 0)) throw new Error("This video has no readable duration");
    if (!(meta.width > 0) || !(meta.height > 0)) {
      throw new Error("This video has no readable picture size");
    }

    return {
      duration,
      width: meta.width,
      height: meta.height,
      displayWidth: meta.width,
      displayHeight: meta.height,
      rotated: false,
      audio: true,
    };
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

type Demuxed = {
  info: Movie;
  samples: Sample[];
  track: Movie["videoTracks"][number];
  description?: Uint8Array;
};

async function demux(buffer: ArrayBuffer): Promise<Demuxed> {
  return new Promise((resolve, reject) => {
    const iso = createFile();
    const samples: Sample[] = [];

    const timer = setTimeout(() => reject(new Error("Could not read the video container")), 20_000);

    iso.onError = (error: string) => {
      clearTimeout(timer);
      reject(new Error(String(error)));
    };

    iso.onReady = (info: Movie) => {
      const found = info.videoTracks[0];
      if (!found) {
        clearTimeout(timer);
        reject(new Error("No video track found"));
        return;
      }
      iso.setExtractionOptions(found.id, null, { nbSamples: Number.POSITIVE_INFINITY });

      iso.onSamples = (_id: number, _user: unknown, chunk: Sample[]) => {
        // Spread-args would blow the stack on a long clip delivered in one pass.
        for (const sample of chunk) samples.push(sample);
        if (!chunk.length || samples.length >= found.nb_samples) {
          clearTimeout(timer);
          resolve({
            info,
            samples,
            track: found,
            description: extractDescription(iso, found.id),
          });
        }
      };

      iso.start();
    };

    const view = buffer.slice(0) as unknown as MP4BoxBuffer;
    view.fileStart = 0;
    iso.appendBuffer(view);
    iso.flush();
  });
}

function extractDescription(iso: ReturnType<typeof createFile>, trackId: number) {
  try {
    const fresh = iso as unknown as {
      getTrackById(id: number): {
        mdia: { minf: { stbl: { stsd: { entries: Record<string, unknown>[] } } } };
      };
    };
    const trak = fresh.getTrackById(trackId);
    const entry = trak.mdia.minf.stbl.stsd.entries[0] as Record<string, unknown>;
    const box = (entry.avcC || entry.hvcC || entry.vpcC || entry.av1C) as
      | { write(stream: DataStream): void }
      | undefined;
    if (!box) return undefined;
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    box.write(stream);
    return new Uint8Array(stream.buffer, 8);
  } catch {
    return undefined;
  }
}

/**
 * mp4box only writes a full codec string when the container carries the codec
 * config box. Files Chrome records itself declare a bare `vp09`, which WebCodecs
 * rejects as ambiguous, so complete the common families from their defaults.
 */
function decoderCodec(raw: string | undefined) {
  const codec = (raw || "").trim();
  if (!codec) throw new Error("This video has no codec information");
  if (codec.startsWith("vp09")) {
    return /^vp09\.\d{2}\.\d{2}\.\d{2}/.test(codec) ? codec : "vp09.00.30.08";
  }
  if (codec.startsWith("av01")) {
    return /^av01\.\d\.\d{2}[A-Z]\.\d{2}/.test(codec) ? codec : "av01.0.04M.08";
  }
  return codec;
}

/**
 * H.264/HEVC need their parameter sets; VP9 and AV1 carry nothing in a
 * `vpcC`/`avcC`-style description that a decoder wants, so pass nothing.
 */
function decoderDescription(raw: string | undefined, description?: Uint8Array) {
  const codec = (raw || "").trim();
  if (codec.startsWith("vp09") || codec.startsWith("av01")) return undefined;
  return description;
}

async function pickCodec(width: number, height: number, bitrate: number, framerate: number) {  const candidates = [
    { codec: "avc1.4d0028", muxer: "avc" as const },
    { codec: "avc1.42001f", muxer: "avc" as const },
    { codec: "vp09.00.10.08", muxer: "vp9" as const },
    { codec: "av01.0.04M.08", muxer: "av1" as const },
  ];
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        framerate,
      });
      if (support.supported) return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error("This browser cannot encode video (WebCodecs is missing or blocked)");
}

async function audioTrack(file: File) {
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  } finally {
    // decodeAudioData rejects on a silent or unsupported file; the device
    // handle stays open forever unless we close it on that path too.
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }
}

export async function compressVideo(
  file: File,
  options: VideoOptions,
  onProgress: (progress: VideoProgress) => void
): Promise<{ blob: Blob; width: number; height: number; note?: string }> {
  if (!canUseWebCodecs()) {
    throw new Error("WebCodecs is not available. Try Chrome, Edge or a recent Safari");
  }

  onProgress({ phase: "demux", done: 0, total: 1 });
  const source = await file.arrayBuffer();
  const { info, samples, track, description } = await demux(source);
  if (!samples.length) throw new Error("No frames could be read from this video");

  const timescale = track.timescale || info.timescale || 1;
  const declared = finite(info.duration / (info.timescale || 1), 0);
  const last = samples[samples.length - 1];
  // Some files report a broken duration in the header; the sample list never lies.
  const duration = clamp(declared > 0 ? declared : (last.cts + last.duration) / timescale, 0.1, 86_400, 0.1);

  const visual = track.video;
  if (!visual) throw new Error("This track has no video stream");
  const codedWidth = visual.width;
  const codedHeight = visual.height;
  if (!(codedWidth > 0) || !(codedHeight > 0)) {
    throw new Error("This video reports no picture size");
  }

  // Trim range, clamped to the real duration with at least one frame of room.
  const startAt = clamp(options.start ?? 0, 0, duration - 0.1, 0);
  const endAt = clamp(options.end ?? duration, startAt + 0.1, duration, duration);
  const clipDuration = endAt - startAt;

  const timeOf = (sample: Sample) => sample.cts / timescale;
  const keptSamples = samples.filter(
    (sample) => timeOf(sample) >= startAt - 0.5 && timeOf(sample) <= endAt + 0.5
  );
  const framerate = clamp(
    (keptSamples.length || samples.length) / clipDuration,
    12,
    60,
    30
  );

  const maxHeight = clamp(options.maxHeight, 0, 4320, 0);
  const scale = maxHeight > 0 ? Math.min(1, maxHeight / codedHeight) : 1;
  const width = even(codedWidth * scale);
  const height = even(codedHeight * scale);

  // ~0.02 bpp is rough, ~0.11 bpp is generous. Quality 1..100 maps between them.
  const bpp = 0.018 + (clamp(options.quality, 1, 100, 60) / 100) * 0.09;
  const bitrate = clamp(Math.round(width * height * framerate * bpp), 128_000, 50_000_000, 2_000_000);

  const chosen = await pickCodec(width, height, bitrate, framerate);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: chosen.muxer,
      width,
      height,
      frameRate: Math.round(framerate),
    },
    fastStart: "in-memory",
    // H.264 with B-frames does not start at presentation time 0, and some
    // sources start at an arbitrary offset. Let the muxer shift the track so
    // its first sample lands on 0.
    firstTimestampBehavior: "offset",
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  let encodedFrames = 0;
  let failed = false;
  let codecError: unknown = null;
  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;
  let note: string | undefined;

  // A codec that has already reported an error cannot be flushed, so every
  // break out of the pipeline has to surface that error instead of the
  // confusing "Cannot call 'flush' on a closed codec" from the browser.
  const bail = () => {
    if (!failed) return;
    throw new Error(
      codecError instanceof Error && codecError.message
        ? codecError.message
        : "The video encoder or decoder gave up"
    );
  };

  try {
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (error) {
          failed = true;
          codecError = error;
        }
      },
      error: (error) => {
        failed = true;
        codecError = error;
      },
    });
    encoder.configure({
      codec: chosen.codec,
      width,
      height,
      bitrate,
      framerate,
      latencyMode: "quality",
    });

    decoder = new VideoDecoder({
      output: (frame) => {
        try {
          const time = frame.timestamp / 1_000_000;
          // Frames outside the trim range are decoded (the codec needs them)
          // but never drawn or encoded.
          if (time < startAt - 0.001 || time > endAt + 0.001) return;
          ctx.drawImage(frame, 0, 0, width, height);
          const scaled = new VideoFrame(canvas, {
            timestamp: Math.max(0, frame.timestamp - startAt * 1_000_000),
            duration: frame.duration ?? undefined,
          });
          try {
            encoder!.encode(scaled, { keyFrame: encodedFrames % 90 === 0 });
          } finally {
            // encode() throws once the encoder is closed or over-dequeued;
            // without this the frame's GPU buffer is orphaned.
            scaled.close();
          }
          encodedFrames++;
          if (encodedFrames % 4 === 0) {
            onProgress({ phase: "video", done: encodedFrames, total: keptSamples.length });
          }
        } catch (error) {
          // Letting this escape would abort the decoder and hide the real cause.
          failed = true;
          codecError = error;
        } finally {
          frame.close();
        }
      },
      error: (error) => {
        failed = true;
        codecError = error;
      },
    });

    try {
      decoder.configure({
        codec: decoderCodec(track.codec),
        codedWidth,
        codedHeight,
        description: decoderDescription(track.codec, description),
      });
    } catch (error) {
      throw new Error(
        `This browser cannot open ${track.codec || "that"} video (${
          error instanceof Error ? error.message : "configure failed"
        })`
      );
    }

    // Start decoding at the keyframe at or before the in-point: a decoder cannot
    // begin mid-GOP, so the frames before the trim are decoded and then dropped.
    let firstIndex = samples.findIndex((sample) => timeOf(sample) >= startAt);
    if (firstIndex < 0) firstIndex = samples.length - 1;
    while (firstIndex > 0 && !samples[firstIndex].is_sync) firstIndex--;

    let reachedEnd = false;
    for (let index = firstIndex; index < samples.length; index++) {
      const sample = samples[index];
      if (failed) break;
      // Stop on the first keyframe past the out-point; everything before it has
      // already been fed, so the GOP is complete.
      if (reachedEnd && sample.is_sync) break;
      if (!reachedEnd && timeOf(sample) > endAt) reachedEnd = true;

      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: (sample.cts / timescale) * 1_000_000,
        duration: (sample.duration / timescale) * 1_000_000,
        data: sample.data!,
      });
      decoder.decode(chunk);
      // Bound both pipelines: the decoder runs ahead of the encoder, and an
      // unbounded queue on a long clip means hundreds of raw frames in memory.
      while (decoder.decodeQueueSize > 24 || encoder.encodeQueueSize > 24) {
        await new Promise((resolve) => setTimeout(resolve, 4));
      }
    }

    bail();
    await decoder.flush();
    // Every frame the decoder produced is still sitting in the encoder queue;
    // flush it before closing, or close() throws those frames away.
    await encoder.flush();
    bail();

    onProgress({ phase: "video", done: keptSamples.length, total: keptSamples.length });

    if (options.keepAudio && clipDuration < 900) {
      onProgress({ phase: "audio", done: 0, total: 1 });
      const audio = await audioTrack(file);
      if (audio && audio.numberOfChannels > 0) {
        note = await encodeAudio(muxer, audio, startAt, endAt).catch(
          () => "Audio could not be re-encoded and was dropped."
        );
      } else {
        note = "No audio track was found.";
      }
    } else if (!options.keepAudio) {
      note = "Audio was left out: the switch is off.";
    }

    onProgress({ phase: "mux", done: 0, total: 1 });
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: "video/mp4" });
    return { blob, width, height, note };
  } finally {
    // A throw anywhere in the pipeline (a bad sample, a flush that fails, the
    // user closing the tab mid-encode) must still hand the hardware encoder
    // back, or the next run on this page finds none.
    if (encoder && encoder.state !== "closed") encoder.close();
    if (decoder && decoder.state !== "closed") decoder.close();
  }
}

type ChunkMuxer = Pick<Muxer<ArrayBufferTarget>, "addAudioChunk">;

async function encodeAudio(
  muxer: ChunkMuxer,
  audio: AudioBuffer,
  startAt: number,
  endAt: number
): Promise<string | undefined> {
  let encoder: AudioEncoder | null = null;
  let dropped: string | undefined;
  try {
    const channels = Math.min(2, audio.numberOfChannels);
    encoder = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addAudioChunk(chunk, meta);
        } catch {
          dropped = "Audio could not be muxed and was dropped.";
        }
      },
      error: () => {
        dropped = "Audio could not be encoded and was dropped.";
      },
    });
    encoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: channels,
      bitrate: 128_000,
    });

    const chunkFrames = 4096;
    const left = audio.getChannelData(0);
    const right = channels > 1 ? audio.getChannelData(1) : left;
    const fromFrame = Math.min(audio.length, Math.floor(startAt * audio.sampleRate));
    const toFrame = Math.min(audio.length, Math.ceil(endAt * audio.sampleRate));

    for (let offset = fromFrame; offset < toFrame; offset += chunkFrames) {
      if (dropped) break;
      const frames = Math.min(chunkFrames, toFrame - offset);
      const planar = new Float32Array(frames * channels);
      planar.set(left.subarray(offset, offset + frames), 0);
      if (channels > 1) planar.set(right.subarray(offset, offset + frames), frames);

      const data = new AudioData({
        format: "f32-planar",
        sampleRate: audio.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: ((offset - fromFrame) / audio.sampleRate) * 1_000_000,
        data: planar,
      });
      encoder.encode(data);
      data.close();
    }

    await encoder.flush();
    return dropped;
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
  }
}
