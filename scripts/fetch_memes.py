#!/usr/bin/env python3
"""Download the meme template set into public/memes.

Only needed when the template list should be refreshed; the generated files are
committed. Usage:

    python3 scripts/fetch_memes.py            # 200 templates (default)
    python3 scripts/fetch_memes.py --limit 40

Sources, in order:

1. the public Imgflip API (https://api.imgflip.com/get_memes) — the top 100,
   with their real ids and box counts;
2. the Imgflip sitemap (https://imgflip.com/sitemap.xml) — the rest of the
   catalogue. Each template page is fetched for its canonical name (the same
   wording the API uses, so top-100 entries dedupe cleanly) and for the blank
   template image URL.

Images are stored locally so the app never talks to a third party at runtime
and keeps working offline; rights stay with the original owners (see
public/memes/CREDITS.md).
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from html import unescape
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FULL_DIR = ROOT / "public" / "memes"
THUMB_DIR = FULL_DIR / "thumbs"
MANIFEST = ROOT / "src" / "lib" / "memes.generated.ts"
API = "https://api.imgflip.com/get_memes"
SITEMAP = "https://imgflip.com/sitemap.xml"

FULL_EDGE = 1100
THUMB_EDGE = 240
UA = {"User-Agent": "Kilosmith-template-builder/1.0"}

# <img alt="Gru's Plan Blank Meme Template" src="/s/meme/Grus-Plan.jpg"/>
BLANK_TEMPLATE = re.compile(r'<img alt="([^"]*?) Blank Meme Template" src="(/s/meme/[^"]+)"')


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "template"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


def build_entry(
    meme_id: str, slug: str, name: str, image_url: str, boxes: int
) -> dict | None:
    """Download (once), re-encode to WebP and measure one template.

    Returns None when the image cannot be fetched or decoded — the caller
    simply moves on to the next candidate.
    """
    target = FULL_DIR / f"{slug}.webp"
    thumb = THUMB_DIR / f"{slug}.webp"
    try:
        if not target.exists() or not thumb.exists():
            raw = fetch(image_url)
            image = Image.open(BytesIO(raw))
            if image.mode != "RGB":
                # Flatten any transparency onto white so a PNG template never
                # exports with a black background.
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.getchannel("A"))
                image = background
            image.thumbnail((FULL_EDGE, FULL_EDGE), Image.LANCZOS)
            image.save(target, "WEBP", quality=82, method=6)
            thumb_image = image.copy()
            thumb_image.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.LANCZOS)
            thumb_image.save(thumb, "WEBP", quality=72, method=6)
            time.sleep(0.15)
        with Image.open(target) as check:
            width, height = check.size
    except Exception as error:  # noqa: BLE001 - skip anything that will not decode
        print(f"  skip {name}: {error}")
        return None
    return {
        "id": meme_id,
        "slug": slug,
        "name": name,
        "width": width,
        "height": height,
        "boxes": boxes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()

    FULL_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    seen: set[str] = set()

    # 1. The API's top 100 — real ids and box counts, in popularity order.
    payload = json.loads(fetch(API).decode("utf-8"))
    memes = payload["data"]["memes"][: args.limit]

    for meme in memes:
        slug = slugify(meme["name"])
        while slug in seen:
            slug = f"{slug}-{meme['id'][-4:]}"
        seen.add(slug)
        entry = build_entry(meme["id"], slug, meme["name"], meme["url"], meme.get("box_count", 2))
        if not entry:
            continue
        entries.append(entry)
        print(f"[{len(entries):3}] {meme['name']} -> {slug}.webp {entry['width']}x{entry['height']}")

    # 2. Sitemap overflow: everything past the API's top 100.
    if len(entries) < args.limit:
        sitemap = fetch(SITEMAP).decode("utf-8", "replace")
        paths = re.findall(r"https://imgflip\.com/meme/([^<\s]+)", sitemap)
        print(f"\nsitemap: {len(paths)} template pages, need {args.limit - len(entries)} more\n")

        for path in paths:
            if len(entries) >= args.limit:
                break

            # Cheap exact-name skip before touching the network for a page.
            if slugify(path) in seen:
                continue

            # The page carries the canonical name (same wording the API uses,
            # so top-100 entries dedupe against it) and the blank-template URL.
            try:
                page = fetch(f"https://imgflip.com/meme/{path}").decode("utf-8", "replace")
            except Exception as error:  # noqa: BLE001
                print(f"  skip page {path}: {error}")
                continue
            match = BLANK_TEMPLATE.search(page)
            name = unescape(match.group(1)) if match else path.replace("-", " ")
            image_url = (
                f"https://imgflip.com{match.group(2)}"
                if match
                else f"https://imgflip.com/s/meme/{path}.jpg"
            )
            time.sleep(0.15)

            slug = slugify(name)
            if slug in seen:
                continue  # already covered by the API's top 100
            seen.add(slug)

            entry = build_entry(path, slug, name, image_url, boxes=2)
            if not entry:
                continue
            entries.append(entry)
            print(f"[{len(entries):3}] {name} -> {slug}.webp {entry['width']}x{entry['height']}")

    lines = [
        "// Generated by scripts/fetch_memes.py: do not edit by hand.",
        "export type MemeTemplate = {",
        "  id: string;",
        "  slug: string;",
        "  name: string;",
        "  width: number;",
        "  height: number;",
        "  boxes: number;",
        "};",
        "",
        f"export const MEME_TEMPLATES: MemeTemplate[] = {json.dumps(entries, indent=2)};",
        "",
    ]
    MANIFEST.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n{len(entries)} templates -> {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
