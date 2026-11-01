/**
 * Minimal ICO writer: a header, one directory entry per image, then the PNG
 * payloads untouched. Browsers and Windows both accept PNG-in-ICO.
 */
export function buildIco(images: { size: number; png: Uint8Array }[]): Blob {
  const count = images.length;
  const header = 6;
  const directory = 16 * count;
  let offset = header + directory;

  const total =
    offset + images.reduce((sum, image) => sum + image.png.byteLength, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, count, true);

  images.forEach((image, index) => {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > 256) {
      throw new Error(`ICO entries must be 1–256px, got ${image.size}`);
    }
    const entry = header + index * 16;
    // The directory is one byte wide: 256 is written as 0 by convention.
    view.setUint8(entry, image.size === 256 ? 0 : image.size);
    view.setUint8(entry + 1, image.size === 256 ? 0 : image.size);
    view.setUint8(entry + 2, 0); // palette
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, image.png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(image.png, offset);
    offset += image.png.byteLength;
  });

  return new Blob([buffer], { type: "image/x-icon" });
}
