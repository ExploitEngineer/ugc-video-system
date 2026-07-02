// Curated registry of Plainly's public ready-made **Designs** usable as a
// single-clip branded wrap (no custom .aep needed).
//
// Why a hardcoded registry: designs are NOT projects — `GET /projects/{id}/
// templates/{tid}` 404s for them, so their parameter schema can't be discovered
// at runtime (the only live discovery is a *render*, which costs minutes). The
// public design set is fixed, so we pin the ones we curated + their schema here.
// Verified live 2026-06-29 (`GET /api/v2/designs` + render probes): every
// `media-*` design shares ONE schema with a single video slot (`image`).
//
// Parameter KEYS are bare names (no `#`): the `#name` seen in a render's
// `parametrizationResults` is the AE layer reference; the submit `parameters`
// key drops the `#`. Confirmed by a live render — `{ image, newsHeading, … }`
// rendered our clip into the template.

import type { PlainlyTemplateParam } from "./index.js";

export interface PlainlyDesignVariant {
  /** The `templateId` to render (the design's variant). */
  templateId: string;
  label: string;
  aspectRatio: "SQUARE" | "STORY" | "WIDE";
  /** The template's fixed output duration (seconds) — designs don't auto-fit. */
  durationSec: number;
  /** A rendered example MP4 of this variant (from the live catalog), for the
   *  picker preview. Null when the live catalog is unavailable (offline/no key). */
  previewUrl?: string | null;
  /** A still poster for the variant, if the catalog exposes one. */
  thumbnailUrl?: string | null;
}

export interface PlainlyDesign {
  /** The `projectId` to render (the public design id, e.g. `media-classic@v1`). */
  projectId: string;
  name: string;
  description: string;
  variants: PlainlyDesignVariant[];
  /** Plainly's catalog category (e.g. "Media & Publishers"), attached from the
   *  live catalog when available — shown as a badge so the user knows what it is. */
  category?: string;
  /** Ad-type ids (registry slugs) this design suits, for the "Recommended for
   *  your ad type" hint. Soft guidance only — any design renders any clip. */
  suggestedAdTypes?: string[];
}

/** Shared parameter schema for the `media-*` design family (one video slot +
 *  headline/subheading/CTA text + logo + music + two brand colors).
 *
 *  `mandatory` here is OUR required-ness for the UI (not Plainly's): the clip
 *  (`image`) and a headline are required; everything else is optional. Blank
 *  behaviour (verified live, see the plainly-optional-fields memory): blank DATA
 *  params clear when sent as ""; blank MEDIA params (logo/music) fall back to the
 *  template's STOCK default and can't be hidden — so we OMIT them when blank. */
export const MEDIA_DESIGN_PARAMS: PlainlyTemplateParam[] = [
  { name: "newsHeading", layerType: "DATA", mandatory: true },
  { name: "newsSubheading", layerType: "DATA", mandatory: false },
  { name: "newsCta", layerType: "DATA", mandatory: false },
  { name: "image", layerType: "MEDIA", mediaType: "video", mandatory: true },
  { name: "newsLogo", layerType: "MEDIA", mediaType: "image", mandatory: false },
  { name: "newsMusic", layerType: "MEDIA", mediaType: "audio", mandatory: false },
  // COLOR (live `type:"COLOR"`), NOT DATA: Plainly expects 6-digit hex WITHOUT a
  // leading '#' (`"242423"`) — the provider strips the '#' on submit. Typed COLOR
  // so a blank value is OMITTED (an empty color is invalid) instead of sent as "".
  { name: "colorPrimary", layerType: "COLOR", mandatory: false },
  { name: "colorSecondary", layerType: "COLOR", mandatory: false },
];

/** Square + Story variants share a design's duration. */
function mediaVariants(durationSec: number): PlainlyDesignVariant[] {
  return [
    { templateId: "square", label: "Square 1:1", aspectRatio: "SQUARE", durationSec },
    { templateId: "story", label: "Story 9:16", aspectRatio: "STORY", durationSec },
  ];
}

/** The designs we offer in the editor's picker. Durations are the live values.
 *  `suggestedAdTypes` are registry slugs (see agents/ad-types/registry.ts:
 *  service, testimonial, brand-story, inspirational, product-demo, lifestyle,
 *  founder-pov) — soft picker guidance, not a constraint. */
export const PLAINLY_DESIGNS: PlainlyDesign[] = [
  {
    projectId: "media-classic@v1",
    name: "Classic",
    description: "Clean editorial frame with headline + CTA.",
    variants: mediaVariants(15),
    suggestedAdTypes: ["testimonial", "brand-story", "service"],
  },
  {
    projectId: "media-abstract@v1",
    name: "Abstract",
    description: "Geometric split-panel motion.",
    variants: mediaVariants(13),
    suggestedAdTypes: ["product-demo", "inspirational"],
  },
  {
    projectId: "media-urban@v1",
    name: "Urban",
    description: "Bold street-style typography.",
    variants: mediaVariants(15),
    suggestedAdTypes: ["lifestyle", "product-demo"],
  },
  {
    projectId: "media-timeless@v1",
    name: "Timeless",
    description: "Elegant, minimal layout.",
    variants: mediaVariants(15),
    suggestedAdTypes: ["brand-story", "founder-pov"],
  },
  {
    projectId: "media-evergreen@v1",
    name: "Evergreen",
    description: "Soft, organic framing.",
    variants: mediaVariants(11),
    suggestedAdTypes: ["lifestyle", "inspirational"],
  },
  {
    projectId: "media-retro@v1",
    name: "Retro",
    description: "Vintage grain + accents.",
    variants: mediaVariants(11),
    suggestedAdTypes: ["brand-story", "lifestyle"],
  },
];

const BY_PROJECT = new Map(PLAINLY_DESIGNS.map((d) => [d.projectId, d]));

/** A curated design, or undefined for an arbitrary (custom-project) id. */
export function findDesign(projectId: string): PlainlyDesign | undefined {
  return BY_PROJECT.get(projectId);
}

/** True when this projectId is one of our curated public designs. */
export function isDesignId(projectId: string): boolean {
  return BY_PROJECT.has(projectId);
}

/** A design variant's fixed output duration, for final-video metadata. */
export function designVariantDuration(
  projectId: string,
  templateId: string,
): number | undefined {
  return findDesign(projectId)?.variants.find((v) => v.templateId === templateId)
    ?.durationSec;
}
