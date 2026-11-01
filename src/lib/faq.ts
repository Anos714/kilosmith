export const faq = [
  {
    question: "Is Kilosmith really free?",
    answer:
      "Yes. All eight tools are free, with no account, no watermark and no file limit. Every file is processed on your own device, so there is no server bill to pass on to you.",
  },
  {
    question: "Where do my files actually go?",
    answer:
      "Nowhere. Images are decoded with the browser's own image decoder and re-encoded with its encoder; video is re-encoded with WebCodecs on your GPU. Open the browser's Network panel while you work and you will see no upload requests.",
  },
  {
    question: "How does the video compressor work without a server?",
    answer:
      "Kilosmith decodes the clip with WebCodecs, re-renders each frame into a canvas and encodes it again at the bitrate you chose, then writes a fresh MP4 with mp4-muxer. It is the same thing ffmpeg would do, using the hardware encoder you already own.",
  },
  {
    question: "Why is video slower than image compression?",
    answer:
      "An image is one frame. A 60-second clip at 30fps is 1,800 frames that each need to be decoded, scaled and re-encoded. Short clips finish in seconds; a few minutes of 4K can take a while.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Image tools work in any modern browser. Video compression needs WebCodecs: Chrome or Edge 94+, and Safari 16.4 or newer. Firefox support is still partial, so the video tab explains when it is unavailable.",
  },
  {
    question: "Can I use the output commercially?",
    answer:
      "Yes. Your files stay yours: no attribution, no licence, no upload. Compress a client video, export a meme, ship a favicon: it is all yours.",
  },
  {
    question: "Does Kilosmith use analytics or cookies?",
    answer:
      "No analytics, no tracking pixels and no advertising cookies. The only cookie-sized thing on this site is the theme, and there isn't even that. Everything is local state.",
  },
  {
    question: "Is the AVIF really AVIF?",
    answer:
      "Yes. Almost no browser can encode AVIF from a canvas, so Kilosmith ships a small WebAssembly AVIF encoder and loads it only when you pick AVIF. The trade-off is speed and transparency: an AVIF takes longer than a WebP, and transparent pixels are composited on white because this encoder has no alpha channel.",
  },
  {
    question: "Where do the meme templates come from?",
    answer:
      "The 200 templates are fetched once from Imgflip's public catalogue, re-encoded to WebP and shipped with the app, so they load from this site and work offline. Rights stay with each image's owner. See the credits file. Dropping your own photo uses the same editor and never leaves your device.",
  },
  {
    question: "Why do some HEIC files fail to open?",
    answer:
      "HEIC is Apple's format. Safari decodes it, Chrome does not yet. If a photo will not load, export it as JPEG from Photos first; Kilosmith will happily process that.",
  },
  {
    question: "Does it work offline?",
    answer:
      "Once the page has loaded, yes. No tool on this site calls a server after the initial download, so a plane, a train tunnel or a flaky office Wi-Fi will not stop you.",
  },
];
