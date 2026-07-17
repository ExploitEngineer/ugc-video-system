# After Effects Template Spec - AI Ad Video System

## What the system does with your template

Our system generates the _content_ with AI, then drops it into your After Effects template and renders the final ad.
You design the **layout, motion, timing, and graphics**.
We fill the empty spots.

For every template we auto-generate and inject:

- **Video footage** - one live-action clip (product/scene), sliced into your video placeholders.
  This footage is PLAIN: no text, no logos, no captions baked in.
  All text and graphics come from YOUR template.
- **Text copy** - written by AI into your text layers (headline, hook, CTA, etc.).
- **Still images** - optional, for image placeholders we mark as "content".

So build the template as if a client will hand you their footage and copy later.
Leave clear, empty placeholders.
We are that client, automated.

## The 2 templates we want

|                 | Template A                      | Template B                      |
| --------------- | ------------------------------- | ------------------------------- |
| **Orientation** | Vertical **9:16** (1080x1920)   | Horizontal **16:9** (1920x1080) |
| **Use**         | Reels / TikTok / Stories        | YouTube / landscape web ads     |
| **Length**      | 10-15 seconds                   | 10-15 seconds                   |
| **Structure**   | Hook -> product showcase -> CTA | Hook -> product showcase -> CTA |

Both should be a clean, modern **product-ad** structure:

1. Opening hook (big text + first footage moment)
2. Product showcase (footage fills most of the frame)
3. Closing CTA (text + optional logo)

Keep them **distinct in style** (e.g. A = bold kinetic text, B = calm minimal) so we can test two looks.

## Hard rules (break these and the render fails)

### File format

- Deliver a **`.aep`** file, or a **`.zip`** made with _File -> Dependencies -> Collect Files_ (project + all footage/assets).
- **No `.mogrt`.** Not supported - it will be rejected at upload.

### Composition

- Name the final render comp `Main`, `Master`, `Final`, or `Render` so it is auto-detected.
- The final comp must be **top-level** (not nested inside another comp).
- Comp size sets the ad shape: width >= height -> treated as 16:9, else 9:16.
  Use exactly 1080x1920 or 1920x1080.
- Total duration **between 8 and 60 seconds**.
  For these first two, keep it **10-15s** - that renders as one clean AI clip.
  (Over 15s the footage is generated in multiple pieces and merged, which is heavier and can seam.)

### Text layers

- **Every text layer must have a UNIQUE name across the whole project.**
  Two text layers with the same name abort the entire render.
  Easiest way to stay unique: give each a different placeholder copy.
- **Type realistic placeholder copy at the length you actually want.**
  The placeholder text length is a HARD ceiling for the AI copy.
  If you type "TEXT" but want a full headline, the AI is forced to write ~4 characters.
  So type something like "Your best skin starts here" if that is the length the layout is built for.
- Build the box, tracking, and animation around that real placeholder copy.

### Video / image placeholders

- Make one **placeholder** per spot: either an empty solid, or a precomp (a "PH" comp) sized to the exact box you want filled.
  We size the generated media to that placeholder, so its authored position/scale is preserved.
- **Name them clearly so we classify them right** (see cheat sheet below).
- At least **one video placeholder is required** (that is where the hero footage goes).
  Up to 60 allowed.
  Reusing the same placeholder comp in several scenes is fine - all placements get filled.

### Fonts, effects, plugins

- Cloud renderer is **stock After Effects** - **no third-party plugins** (no Element 3D, Optical Flares, Sapphire, etc.).
  Standard AE effects only.
- Use **common/widely-available fonts** (or include the font files in the zip).
  Missing fonts fall back and break the look.
- **No expression errors.** Test-render clean before sending.

### Audio

- Do not rely on template background music for now - the final uses the AI clip's own audio.
  You can leave an audio track, but assume it may not be the final mix.

## Slot naming cheat sheet

Name your placeholder **layers** (and PH precomps) so the system knows what to do:

| You want...                                      | Name it with                                      | What happens                             |
| ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------- |
| Hero video footage                               | `video`, `clip`, `footage`, `PH_1`, `Media_1`     | AI footage injected                      |
| A photo/product still (AI-filled)                | `photo`, `product`, `hero`, `shot`, `scene`       | AI image injected                        |
| A logo / brand mark (KEEP your art)              | `logo`, `icon`, `badge`, `brand`                  | **Never** AI-filled - your artwork stays |
| A background / texture / overlay (KEEP your art) | `bg`, `background`, `overlay`, `texture`, `frame` | **Never** AI-filled - your artwork stays |
| Dynamic copy                                     | (any unique text)                                 | AI copy injected by layer name           |

Rule of thumb: anything named `logo`/`bg`/`background`/`overlay`/`icon` we leave alone (design it fully).
Anything named `video`/`photo`/`product`/`PH`/`Media` we fill.

## Delivery checklist

- [ ] `.aep` or Collect-Files `.zip`
- [ ] Two templates: one 9:16 (1080x1920), one 16:9 (1920x1080)
- [ ] final comp named `Main`/`Master`/`Final`
- [ ] >=1 clearly-named video placeholder each
- [ ] All text layers uniquely named, with real placeholder copy at intended length
- [ ] Placeholders named per the cheat sheet
- [ ] No third-party plugins, no expression errors, common fonts (or fonts included)
- [ ] A sample render (mp4) of each so we can compare
