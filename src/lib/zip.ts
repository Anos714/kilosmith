import { zip, type Zippable } from "fflate";

/**
 * Images are already compressed, so deflating them costs seconds and saves
 * nothing. Store mode keeps the archive step nearly free.
 */
export function makeZip(files: Zippable): Promise<Blob> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 0 }, (error, data) => {
      if (error) reject(error);
      else resolve(new Blob([data as BlobPart], { type: "application/zip" }));
    });
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
