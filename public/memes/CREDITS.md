# Meme template credits

The 100 images in this folder come from the public Imgflip meme catalogue
(https://imgflip.com), fetched by `scripts/fetch_memes.py` and re-encoded to
WebP locally so the app serves them from its own origin and works offline.

They are included as meme templates. Copyright and any other rights in each
image remain with its original owner; nothing here is claimed by Kilosmith.
If you own one of these images and would like it removed, open an issue on
https://github.com/Anos714/kilosmith or mail sainrahul374@gmail.com and it will
be deleted.

Re-generate the set (network required):

```bash
python3 scripts/fetch_memes.py
```

That rewrites `public/memes/`, `public/memes/thumbs/` and
`src/lib/memes.generated.ts`.
