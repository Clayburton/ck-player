# ck-player — the clay and kelsy music player

A track list where **the hairline rule under each song IS that song's waveform**,
and it draws itself as you listen.

**The shape is the song.** Every envelope is measured from the master by
`tools/waveforms.py` and shipped as data — 1024 columns, one byte each, ~1.4KB a
track. Nothing about the shape is invented, animated, or randomised. Loud
choruses are tall, breakdowns are thin, outros taper.

- **at rest** — the song's shape, pale and low.
- **on hover** — it rises to full height and one flex travels through it (the
  flex scales the shape, it never displaces it), the title scrambles in mono,
  the number becomes a play arrow.
- **playing** — everything behind the playhead inks in pink, left to right. The
  playhead bead breathes with the live level — slowly, on purpose. It's a
  breath, not a wiggle.
- **the rule is the scrubber** — click or drag it to seek.
- **idle** — every ~11s a slow sweep passes down the list and lifts each shape.

Vanilla HTML/CSS/JS + three.js. No build step, no React, no Tailwind, no models,
no post stack: one grain quad plus one thin strip per row, all sharing a single
shader program.

## The module is exactly as tall as its list

Five songs make a five-song-tall player; two make a two. The page posts its real
height to the parent and the embed grows the iframe to match — nothing is ever
cropped and there's no inner scrollbar.

> **Never use `vh`/`dvh`/`svh` in this project's CSS.** The parent grows the
> iframe's height, so a viewport-height unit inside it is a resize feedback loop.
> `vw` is safe — width doesn't change while it grows.

## Putting it somewhere new

1. Add a playlist to `playlists.js` (the only file you edit):

   ```js
   "moo-demos": {
     tag:  "[ listen ]",
     note: "made with moo-osc",
     foot: { label: "[ the collection ]", href: "https://clayandkelsy.com/..." },
     sign: "clay and kelsy",
     tracks: [
       { title:"…", meta:"…", dur:203, src:"https://…/song.mp3", url:"https://…" },
     ],
   }
   ```

2. Drop the audio into `Music for player 1/<release>/`, add it to `SONGS` in
   `tools/waveforms.py`, run `python3 tools/waveforms.py`, and bump
   `waveforms.js?v=N`. Waveforms are keyed by the mp3 basename, so nothing else
   needs wiring. A track with no extracted waveform still plays — it just draws
   a plain rule.

3. Paste `wordpress-embed.html` into a Custom HTML block and change
   `?list=i-am` to your new key. That's the whole job.

A track with no `src` is a link-only row — it still hovers, it just doesn't play.

### Encoding a master

```
ffmpeg -i "master.wav" -vn -c:a libmp3lame -q:a 3 \
  -metadata title="…" -metadata artist="clay and kelsy" assets/<key>.mp3
```

### Audio hosting

`src` must send CORS headers or the live waveform can't be read (playback still
works; the line falls back to a synthetic envelope). **GitHub Pages and jsDelivr
both send `access-control-allow-origin: *`** — verified. WordPress media does
not, and VideoPress hijacks video uploads, so keep audio on GitHub.

Range support matters too: seeking (and therefore scrubbing) needs
`accept-ranges: bytes`. GitHub Pages sends it. **The local Python preview server
does not** — `seekable.end(0) === 0` locally, so scrubbing only works once
deployed. Don't chase that as a bug.

## Files

| file | what it is |
|---|---|
| `index.html` | shell + importmap (three pinned to the same jsDelivr URL as the other pieces, so it's a shared CDN cache hit). Bump `?v=N` after every edit. |
| `styles.css` | type, row grid, states. Brand tokens at the top. |
| `app.js` | the engine — shader, audio graph, analyser recording, interaction. Tunables in `P` at the top. |
| `playlists.js` | **the only file you edit per placement.** |
| `waveforms.js` | GENERATED — the real envelopes. Never hand-edit. |
| `tools/waveforms.py` | regenerates the above from the masters. |
| `assets/*.mp3` | encoded from the masters in `Music for player 1/` (gitignored). |
| `wordpress-embed.html` | the paste-in block. |

Preview: launch config `ck-player`, port **8856**.

## Notes for future me

- **`side: THREE.DoubleSide` is required on every mesh.** The camera is an
  orthographic *pixel-space* camera (`top:0, bottom:H`) so DOM coordinates map
  straight to world coordinates — but that puts a negative Y scale in the
  projection matrix, which flips triangle winding. With the default `FrontSide`
  every quad is backface-culled: draw calls count, zero fragments, blank canvas,
  no error. Cost half an hour once.
- **Peak alone is useless on these masters.** They're brick-walled, so a raw peak
  envelope sits pinned near maximum for the whole song and draws a featureless
  sausage. `waveforms.py` is RMS-led (that tracks the arrangement) with peak
  mixed in for transient jaggedness, then stretches each song across its **own**
  dynamic range so its structure is visible.
- The body is kept deliberately airy (alpha ~0.28 at rest). A dense master drawn
  at full alpha reads as a grey slab, not as a waveform.
- One player audible per page: instances talk over a `BroadcastChannel` and pause
  each other (same-origin iframes, so it works across two embeds on one page).
- The render loop parks itself off-screen, but **never while a song is playing**,
  and any pointer/scroll/visibility event restarts it — an IntersectionObserver
  inside a cross-origin iframe can misreport on iOS Safari, so it must fail open.

Debug: `window.__ckp` — `.play(i)`, `.hover(i)`, `.simulate(i, 0.6)` (paint a
fake listen), `.renderOnce()`, `.height()`, `.gl`.

## Status

Built and verified locally (2026-07-21). **Not deployed yet** — when you want it
live: create `Clayburton/ck-player`, push, flip it public, enable Pages
(Settings → Pages → branch `main` `/root`), then paste the embed block.
