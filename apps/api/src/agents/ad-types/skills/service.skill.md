---
name: ad-type-service
description: >-
  Service ad type. A short narrative/skit ad for a SERVICE or software (SaaS,
  agency, local service, coaching) with NO uploaded product or person — the cast
  is synthesized and the scenes are authored by the creative_brief (creative
  director) step. Use when authoring or revising the service ad type's detection
  cues, asset policy, hooks, look, voice, and prompt-fragment prose in
  defs/service.ts.
---

# Ad type — Service Ad

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/service.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The DEFAULT ad type for a bare prompt
> with no uploads: a scripted, multi-scene live-action skit that sells a SERVICE.
> The `creative_brief` step plans the cast + scenes (no product/person sheet).

## Intent

A short, scripted narrative/skit for a service or software — synthesized
characters act out a relatable problem and the service resolving it. Dynamic and
prompt-driven (the creative-director brief chooses the framework + hook), never a
fixed template.

## Detection cues

Route here when the prompt describes a SERVICE / software / agency / app /
coaching with no physical product or uploaded person to show — "we provide…",
"our platform…", "we help businesses…". The DEFAULT when nothing is uploaded.

## Asset policy

- **product: optional** and **person: optional** — service ads upload neither;
  the cast is synthesized from the creative brief.

## Favored hooks

- **defaultHooks:** `problem-solution`, `striking-visual`
- **allowedHooks:** `problem-solution`, `striking-visual`, `pattern-interrupt`,
  `curiosity-gap`, `relatable-scenario`, `confession`, `before-after`

## Look & treatment

- **lookFamily:** `cinematic_polished`. LOOK-driven seams defer to the shared base.

## Script / voice tone

Scripted spoken DIALOGUE by the on-screen characters (lip-synced), ONE speaker
per shot — natural, conversational, in service of the story.

## Notes

The default no-upload type. The `creative_brief` step authors the real cast +
scenes; these fragments are the per-seam fallbacks for the storyboard/video
builders.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`. LOOK-driven seams are omitted — they come
from the `cinematic_polished` look base.

### storyboardTypeBlock

```
AD TYPE — Service Ad (scripted service skit):
- The ad is a short, scripted live-action SKIT that sells a service or software.
  Synthesized characters act out a relatable problem and the service resolving
  it across the scenes — there is NO physical product to show.
- Each scene's `transcript` is the ON-SCREEN character's spoken DIALOGUE line for
  that scene (lip-synced), short and conversational. Use ONE speaker per scene.
```

### storyboardSpeakerLabel

```
the on-screen character
```

### videoVoice

```
the on-screen characters' own natural voices
```

### videoAudioLine

```
Audio: each on-screen character speaks their line lip-synced with the mouth visible, ONE speaker per shot (never two voices at once); quote each line verbatim in its slice and keep it short; light location ambience and a fitting score.
```

### narrativeTreatment

```
Treatment: a scripted service skit — synthesized characters act out the problem and the service resolving it. The spoken beat in each summary is an on-screen character's dialogue line.
```
