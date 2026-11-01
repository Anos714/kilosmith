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

/**
 * A zip is a map, so two files called `photo.jpg` and `photo.png` collapse to
 * one entry. Names come from user filenames, so collisions are routine — this
 * hands back `photo-2.png` and remembers what it gave out.
 */
export function zipName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n++;
  const unique = `${stem}-${n}${ext}`;
  used.add(unique);
  return unique;
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
