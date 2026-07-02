# Plainly brand-wrap `.aep` template — build spec

**Goal:** wrap ONE generated ~15s clip (full-frame) with light, user-driven branding —
logo + headline/subheading/CTA + brand color + optional music bed — and render it on
Plainly with **zero stock content**. This is the template type our pipeline needs (the
public "Designs" and random title/typography templates are the wrong type).

Hand this whole file to an After Effects motion designer (Fiverr/Upwork, ~$50–150) or
follow it yourself in AE. It is written to match Plainly's parametrization rules and to
drop straight into our editor (`/studio/[runId]/plainly` → Advanced custom-id, or the
design registry).

## Hard rules (from Plainly's docs — do not skip)
- **No stock content.** Build every layer yourself. Do NOT base this on a public Plainly
  Design or any template that ships footage/music/placeholder graphics. The output must
  contain only our layers.
- **Container comps for media.** Each dynamic image/video sits in its OWN precomp. Put
  NO effects or keyframes on the media layer itself — all scaling/positioning goes on the
  container comp.
- **No "All Caps."** Don't use the character-panel All Caps toggle (Plainly warns on it +
  it breaks dynamic text). If you want caps, type the text already capitalized.
- **Render comp prefix.** Name each final composition with a `render_` prefix.
- **Mark dynamic layers** with a clear name prefix so they're easy to parametrize.
- **Package fonts** (OTF/TTF only) next to the `.aep` in the zip; their PostScript names
  must exactly match what the project uses. Use freely-licensable fonts (e.g. Open Sans,
  Inter, Montserrat) — NOT Arial/Myriad/Helvetica.

## Compositions (one render comp per aspect ratio)
Build three render comps, all ~15s, 30fps, sharing the same nested structure:
- `render_main_9x16` — 1080×1920 (vertical / Story)
- `render_main_1x1`  — 1080×1080 (square)
- `render_main_16x9` — 1920×1080 (landscape)

Inside each render comp, bottom-to-top:

1. **`dyn_clip`** (full-frame video) — a precomp `clip_container` filling the whole frame.
   Inside it, one video layer (this is the slot our clip goes into). Apply Plainly's
   **Auto Scale to Comp** expression to that layer (mode: **contain** = letterbox, no crop;
   or **fill** = cover/crop — designer's choice, contain is safest for mixed aspects).
   Layer is the MEDIA/video parameter.
2. **`dyn_music`** (audio) — one audio layer for the optional music bed. Set its audio
   level LOW (e.g. −18 to −12 dB) so it sits under the clip's own voice (Plainly has no
   auto-ducking — bake the level here). Make it dynamic (swap by URL) + a visibility/mute
   toggle.
3. **`brand_bar`** (color) — a shape/solid (a lower-third bar or accent) whose fill is a
   **Color Control** effect, so brand color is a dynamic hex parameter.
4. **`dyn_logo`** (image) — a precomp `logo_container` (a corner-placed logo). Inside it one
   image layer (MEDIA/image param). Keep it optional (visibility toggle) so a blank logo
   just hides the layer — NOT a stock fallback.
5. **`txt_headline`**, **`txt_subheading`**, **`txt_cta`** — three TEXT layers (no All Caps),
   positioned lower-third or wherever the design calls for. Each is a TEXT param (value;
   optionally expose font/size).

Keep the branding LIGHT and mostly lower-third/corner so the clip stays the hero. The clip
fills the frame; text/logo/bar overlay it.

## Parameters to expose (Plainly parametrization panel)
| Param (name it clearly) | Layer | Type | Notes |
| --- | --- | --- | --- |
| `clip`        | dyn_clip video    | MEDIA / video | the generated clip URL (required) |
| `headline`    | txt_headline      | TEXT  | required |
| `subheading`  | txt_subheading    | TEXT  | optional (blank = empty, fine) |
| `cta`         | txt_cta           | TEXT  | optional |
| `logo`        | dyn_logo image    | MEDIA / image | optional + visibility toggle |
| `music`       | dyn_music audio   | MEDIA / audio | optional + mute toggle |
| `brandColor`  | brand_bar color   | COLOR | hex |

Optional extra: a **Dropdown** control for a couple of layout/style variants if you want
one template to offer 2–3 looks.

## Aspect-ratio handling
Three separate render comps (above) is the most predictable. The clip's Auto-Scale-to-Comp
expression makes any clip dimension fit each frame. (Plainly does NOT mandate one-comp-per-
ratio; responsive single-comp is possible but per-ratio comps give cleaner control.)

## Known limitation to design around
Plainly's scaling fixes SIZE/ASPECT only, **not clip LENGTH**. Our clips are ~15s, so author
the comps at ~15s and let the clip play within. (We brand one clip per render — we do NOT
ask one template to stitch N clips, so timeline-spreading isn't needed.) If a clip is a hair
shorter/longer than the comp, either trim the comp to the clip or freeze the last frame.

## Deliverables (what to give back)
- The `.aep` (CC 2021+ compatible) with the three `render_*` comps + the nested structure.
- All fonts used (OTF/TTF), placed **next to the `.aep`** in the zip.
- Packaged via **File → Dependencies → Collect Files** (then add the fonts into that
  collected folder) OR the official **Plainly After Effects plugin** ("Export zip"/Upload).
- No `(Footage)` stock assets beyond a tiny neutral placeholder for the clip/logo slots.

## Verify after upload (us)
- `POST /api/v2/projects` (or the plugin) → wait `analyzing → render ready`.
- `GET /api/v2/projects/{id}/meta` → confirm the layer tree is ONLY our comps/assets (no
  stock).
- Parametrize the 7 params above → `GET /projects/{id}/templates/{tid}` should list them.
- Drop `projectId`/`templateId` into our editor's Advanced field → the `clip` MEDIA/video
  param shows a clip picker; text params show inputs → render a test.
