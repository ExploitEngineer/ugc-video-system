# Agent & Skill I/O reference

An at-a-glance lookup, **per agent and per skill**, of _what image(s) go in, what
prompt/text goes in, and what comes out._ It is the I/O contract only — for the
end-to-end **flow** (state machine, gates, four flows) see
[pipeline.md](pipeline.md); for the exact **API payloads** sent to the models see
`apps/api/src/providers/`.

A "skill" = a prompt module (`prompt.ts`) + a function `(ctx, input) => result`,
living under `apps/api/src/agents/<agent>/<skill>/`.

## Legend

- `img` — an `ImageRef` (`{ source, mime? }`, a public/signed URL or base64 data URI).
- `text` — plain string prompt/brief.
- `meta` — JSON metadata carried on the artifact row (not an image).
- `?` — optional input.
- **Models:** image generation = `gpt-image-2`; all reasoning/vision = `gpt-4.1`;
  video = Seedance 2.0 via BytePlus ModelArk.

Every skill **also** receives a shared `SkillContext` (`agents/types.ts`):
`{ runId, adStyle, adType (ugc|inspirational), aspectRatio, openai, video }`. It is
listed once here and not repeated per row.

---

## Creative Direction Agent — `agents/creative-direction/`

Orchestrator + the LLM "thinking" skills (no images produced; vision used to read
inputs). `gpt-4.1`.

| Skill                                       | Image in                                  | Prompt / text in                                                      | Other | Output                                                                                       |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `interpretAdStyle` (`interpret-style/`)     | —                                         | `userPrompt`                                                          | —     | `{ adStyle: text, adType: ugc \| inspirational }`                                            |
| `planPersonBrief` (`person-brief/`)         | `productUpload` (vision)                  | `userPrompt`, `adStyle`                                               | —     | `{ personBrief }` — text, 40–70 words (demographics / wardrobe / palette)                    |
| `planRevision` (`plan-revision/`)           | `currentArtifact` (vision), `productRef?` | `message`, `stage` (reference\|storyboard), `adStyle`, `personBrief?` | —     | `RevisionDirective { changes[], keep[], rationale, scope: edit\|regenerate, revisedBrief? }` |
| `interpretFeedback` (`interpret-feedback/`) | —                                         | `message`, `stage`                                                    | —     | `{ intent: approve \| revise }` (defaults to `revise` on parse failure)                      |

`planRevision`'s `revisedBrief` is emitted only at the **reference** gate and is
persisted back to `runs.person_brief`. `driveRun` (`orchestrator.ts`) is the
non-skill entry point that sequences everything.

---

## Image Agent — `agents/image/` (`gpt-image-2`)

Produces the composite reference/storyboard sheets. Each output is a single 2×2
grid PNG (`2048x1152` for 16:9, `1152x2048` for 9:16).

| Skill                                    | Image in                                                           | Prompt / text in                          | Output                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `productSheetBuilder` (`product-sheet/`) | `productUpload`                                                    | `userPrompt`, `critique?`                 | `ProductReferenceSheet` — 2×2 product views (front / three-quarter / side / rear) PNG + `views` meta + `promptUsed` |
| `generatePersonImage` (`person-image/`)  | `baseRef?` (uploaded photo OR prior person sheet; absent ⇒ invent) | `personBrief`, `userPrompt`, `directive?` | `PersonReferenceSheet` — 2×2 person views PNG + `personDetails` meta                                                |
| `storyboardGenerator` (`storyboard/`)    | `productSheetRef`, `personSheetRef?`                               | `userPrompt`, `critique?`, `directive?`   | `StoryboardSheet` — labelled 2×2 keyframe PNG (badges 01–04 + caption bars) + 4 `scenes[]` meta                     |

**Person agent has three modes**, keyed on `baseRef` + `directive` — and the
product image **never reaches it** (only a product-derived text brief):

| Mode            | When                           | Base image         | API call                                     |
| --------------- | ------------------------------ | ------------------ | -------------------------------------------- |
| **invent**      | product, no person upload      | none (text only)   | `images.generate` from `personBrief`         |
| **from-upload** | person uploaded (first gen)    | uploaded photo     | `images.edit` (identity-locked)              |
| **edit-revise** | revise of a prior person sheet | prior person sheet | `images.edit` (keep subject, change aspects) |

`storyboardGenerator`'s `scenes[]` each hold `{ index, cameraAngle,
actionMovement, sceneDescription, panelCaption, transcript, adStyle }` — the
`sceneDescription` + `transcript` are consumed downstream by the Video Agent.

---

## Critic Agent — `agents/critic/` (`gpt-4.1` vision)

Inspects a generated sheet; the `*Remediate*` variant additionally re-runs the
relevant Image-Agent skill to fix issues (bounded by a **retry cap — max 1
regen**).

| Skill                                          | Image in                                              | Prompt / text in                         | Output                                                            |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `inspectProductSheet` (`product-inspection/`)  | `sheetRef`                                            | `views` meta, `userPrompt`               | `InspectionVerdict { pass, localizedRegen, issues[], summary }`   |
| `inspectAndRemediateProductSheet`              | `initial` sheet, `productUpload`                      | `views`, `userPrompt`                    | `CriticVerdict { outcome, attempts, finalArtifact, lastVerdict }` |
| `inspectStoryboard` (`storyboard-inspection/`) | `sheetRef`                                            | `scenes` meta, `userPrompt`, `hasPerson` | `InspectionVerdict` (`localizedRegen` always `false`)             |
| `inspectAndRemediateStoryboard`                | `initial` sheet, `productSheetRef`, `personSheetRef?` | `scenes`, `userPrompt`                   | `CriticVerdict`                                                   |

Each `issues[]` entry = `{ severity: minor|major|blocking, region, problem, fixHint }`.

- **Product** remediation: if `localizedRegen` ⇒ targeted `images.edit` of only the
  flagged cells; else full rebuild via `productSheetBuilder` with the issues
  threaded in as `critique`.
- **Storyboard** remediation: always a full rebuild via `storyboardGenerator` (no
  localized path).
- `outcome ∈ { approved, regenerated_approved, failed_retry_cap }`.

---

## Video Agent — `agents/video/` (Seedance 2.0 / BytePlus)

| Skill                       | Image in                               | Prompt / text in                             | Other                                                        | Output                                                                                                   |
| --------------------------- | -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `videoBuilder` (`index.ts`) | `storyboardSheetRef`, `personFaceRef?` | `scenes[]` (incl. transcripts), `userPrompt` | `hasPerson`, `durationSec?` (=15), `critique?` (reserved/F7) | `Video` — final MP4 + `durationSec`, `hasAudio`, `providerMeta { provider, model, taskId, videoPrompt }` |

- The **labelled storyboard sheet is the sole shot guide** — the product/person
  _reference sheets_ are **not** sent to Seedance. Identity + framing + shot order
  reach the model via the numbered panels + the `scenes` text + the face ref.
- `personFaceRef` is registered through the BytePlus **face-asset** path
  (`image_url = "asset://<id>"`) and sent **first** as the primary face reference
  (falls back to raw URL if AK/SK unset). See
  [byteplus-face-assets.md](byteplus-face-assets.md).
- Prompt composition: `buildVideoPrompt` (LLM) → engineered single-line Seedance
  directive (global setup / timeline / quality-constraints); falls back to
  `buildDeterministicVideoPrompt` (no LLM) if the LLM fails twice.

---

## Provider call appendix

How the "image in / prompt in" of the tables map onto the actual provider calls
(`apps/api/src/providers/`):

- **`openai.generateImage({ prompt, refs?, size })`** → `images.edit` when `refs`
  present, else `images.generate`. Returns PNG bytes + mime. `size` =
  `2048x1152` (16:9) or `1152x2048` (9:16), divisible-by-16 per gpt-image-2;
  2K (not 4K) to avoid truncated base64 responses. Retries up to 5×.
- **`openai.chat(messages)`** → `gpt-4.1`. `ChatMessage = { role, content,
images? }`; image URLs are fetched and inlined as base64 data URIs before the
  call. Used by every Creative Direction + Critic skill. Returns text.
- **`video.submitVideo({ prompt, referenceImages?, personReferences?, referenceTag?, durationSec, aspectRatio, firstFrame? })`**
  → POST `/api/v3/contents/generations/tasks` (`generate_audio: true`,
  `resolution: "720p"`, `watermark: false`) → returns `{ taskId }`. Poll
  `video.pollVideo(task)` until `completed` → `{ videoUrl, hasAudio, downloadHeaders }`.
- **`ensureFaceAsset(url, name)`** (BytePlus, `assets.ts`) → registers/reuses a
  face asset (V4-signed) and returns the `assetId` used as `asset://<id>`.
