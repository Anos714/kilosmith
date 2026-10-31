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
};

export type VideoProgress = {
  phase: "demux" | "video" | "audio" | "mux";
  done: number;
  total: number;
  note?: string;
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

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

  const meta = await new Promise<{ duration: number; width: number; height: number }>(
    (resolve, reject) => {
      video.onloadedmetadata = () =>
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      video.onerror = () => reject(new Error("This file is not a video the browser can read"));
    }
  );

  URL.revokeObjectURL(url);

  return {
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    displayWidth: meta.width,
    displayHeight: meta.height,
    rotated: false,
    audio: true,
  };
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
        samples.push(...chunk);
        if (samples.length >= found.nb_samples) {
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

async function pickCodec(width: number, height: number, bitrate: number, framerate: number) {
  const candidates = [
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
  try {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    await context.close();
    return buffer;
  } catch {
    return null;
  }
}

export async function compressVideo(
  file: File,
  options: VideoOptions,
  onProgress: (progress: VideoProgress) => void
): Promise<{ blob: Blob; width: number; height: number; note?: string }> {
  if (!canUseWebCodecs()) {
    throw new Error("WebCodecs is not available — try Chrome, Edge or a recent Safari");
  }

  onProgress({ phase: "demux", done: 0, total: 1 });
  const source = await file.arrayBuffer();
  const { info, samples, track, description } = await demux(source);
  if (!samples.length) throw new Error("No frames could be read from this video");

  const duration = info.duration / info.timescale;
  const visual = track.video;
  if (!visual) throw new Error("This track has no video stream");
  const codedWidth = visual.width;
  const codedHeight = visual.height;
  const framerate = Math.min(60, Math.max(12, samples.length / Math.max(0.1, duration)));

  const scale = options.maxHeight ? Math.min(1, options.maxHeight / codedHeight) : 1;
  const width = even(codedWidth * scale);
  const height = even(codedHeight * scale);

  // ~0.02 bpp is rough, ~0.11 bpp is generous. Quality 1..100 maps between them.
  const bpp = 0.018 + (options.quality / 100) * 0.09;
  const bitrate = Math.round(width * height * framerate * bpp);

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
  let encoderError: unknown = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (error) {
        failed = true;
        encoderError = error;
      }
    },
    error: (error) => {
      failed = true;
      encoderError = error;
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

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        ctx.drawImage(frame, 0, 0, width, height);
        const scaled = new VideoFrame(canvas, {
          timestamp: frame.timestamp,
          duration: frame.duration ?? undefined,
        });
        encoder.encode(scaled, { keyFrame: encodedFrames % 90 === 0 });
        scaled.close();
      } finally {
        frame.close();
        encodedFrames++;
        if (encodedFrames % 4 === 0) {
          onProgress({ phase: "video", done: encodedFrames, total: samples.length });
        }
      }
    },
    error: () => {
      failed = true;
    },
  });

  decoder.configure({
    codec: track.codec,
    codedWidth,
    codedHeight,
    description,
  });

  for (const sample of samples) {
    if (failed) break;
    const chunk = new EncodedVideoChunk({
      type: sample.is_sync ? "key" : "delta",
      timestamp: (sample.cts / track.timescale) * 1_000_000,
      duration: (sample.duration / track.timescale) * 1_000_000,
      data: sample.data!,
    });
    decoder.decode(chunk);
    // Bound both pipelines: the decoder runs ahead of the encoder, and an
    // unbounded queue on a long clip means hundreds of raw frames in memory.
    while (decoder.decodeQueueSize > 24 || encoder.encodeQueueSize > 24) {
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
  }

  await decoder.flush();
  // Every frame the decoder produced is still sitting in the encoder queue;
  // flush it before closing, or close() throws those frames away.
  await encoder.flush();
  if (failed) {
    throw new Error(
      encoderError instanceof Error ? encoderError.message : "The video encoder failed"
    );
  }

  onProgress({ phase: "video", done: samples.length, total: samples.length });

  let note: string | undefined;

  if (options.keepAudio && duration < 900) {
    onProgress({ phase: "audio", done: 0, total: 1 });
    const audio = await audioTrack(file);
    if (audio && audio.numberOfChannels > 0) {
      try {
        const audioBitrate = 128_000;
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: () => {
            note = "Audio could not be encoded and was dropped.";
          },
        });
        audioEncoder.configure({
          codec: "mp4a.40.2",
          sampleRate: audio.sampleRate,
          numberOfChannels: Math.min(2, audio.numberOfChannels),
          bitrate: audioBitrate,
        });

        const channels = Math.min(2, audio.numberOfChannels);
        const chunkFrames = 4096;
        const left = audio.getChannelData(0);
        const right = channels > 1 ? audio.getChannelData(1) : left;

        for (let offset = 0; offset < audio.length; offset += chunkFrames) {
          const frames = Math.min(chunkFrames, audio.length - offset);
          const planar = new Float32Array(frames * channels);
          planar.set(left.subarray(offset, offset + frames), 0);
          if (channels > 1) planar.set(right.subarray(offset, offset + frames), frames);

          const data = new AudioData({
            format: "f32-planar",
            sampleRate: audio.sampleRate,
            numberOfFrames: frames,
            numberOfChannels: channels,
            timestamp: (offset / audio.sampleRate) * 1_000_000,
            data: planar,
          });
          audioEncoder.encode(data);
          data.close();
        }

        await audioEncoder.flush();
        audioEncoder.close();
      } catch {
        note = "Audio could not be re-encoded and was dropped.";
      }
    } else {
      note = "No audio track was found.";
    }
  } else if (!options.keepAudio) {
    note = "Audio was left out — the switch is off.";
  }

  onProgress({ phase: "mux", done: 0, total: 1 });
  encoder.close();
  decoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  return { blob, width, height, note };
}
