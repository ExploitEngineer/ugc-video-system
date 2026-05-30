// Prompt module for the Product Sheet Inspection skill (Critic Agent).
//
// The product sheet is attached as a vision image; the LLM judges it against
// the same promises the Product Sheet Builder made (four clean views, one
// consistent product, plain backdrop, images-only) and returns a strict-JSON
// verdict. `region` on each issue names the bad cell so a localized regen can
// target it.

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";

export interface ProductInspectionPromptInput {
  adStyle: string;
  userPrompt: string;
  /** Metadata hint from the artifact row (per-view notes); the image is judged, not this. */
  views: unknown;
  /** The product sheet to inspect, attached as a vision image. */
  sheetRef: ImageRef;
}

export function buildProductInspectionPrompt({
  adStyle,
  userPrompt,
  views,
  sheetRef,
}: ProductInspectionPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the Product Sheet Inspection skill of an ad-video Critic Agent.",
    "A product reference sheet is attached. Judge whether it is fit to drive the",
    "rest of the pipeline, then return a strict-JSON verdict. Be strict but fair:",
    "only fail on real, visible defects — not stylistic preference.",
    "",
    "RUBRIC — the sheet must satisfy ALL of:",
    "1. Exactly FOUR views in a clean 2×2 grid: top-left FRONT, top-right",
    "   THREE-QUARTER, bottom-left SIDE (profile), bottom-right REAR.",
    "2. The SAME product in every cell — identical colors, materials, finish,",
    "   surface details, on-product logos, and proportions. No redesign.",
    "3. Plain seamless neutral backdrop, even shadowless studio lighting,",
    "   product centered with consistent scale and framing across cells.",
    "4. IMAGES ONLY — no baked-in text, labels, captions, view names, numbers,",
    "   arrows, callouts, measurement lines, color swatches, or watermarks.",
    "   (Text physically printed on the product itself is allowed.)",
    "",
    "REGIONS: when an issue is confined to one cell, set `region` to that cell",
    "(`front` | `threeQuarter` | `side` | `rear`). Use `global` when the problem",
    "spans the whole sheet (e.g. wrong product entirely, text across the sheet).",
    "Set `localizedRegen` true ONLY when every issue is cell-scoped and the rest",
    "of the sheet is good (so a partial redraw can fix it); false otherwise.",
    "",
    "SEVERITY: `minor` (cosmetic, still usable), `major` (should be fixed),",
    "`blocking` (unusable downstream). `pass` is true only when there are no",
    "`major` or `blocking` issues.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "pass": boolean, "localizedRegen": boolean, "issues": [ { "severity": "minor"|"major"|"blocking", "region": "front"|"threeQuarter"|"side"|"rear"|"global", "problem": string, "fixHint": string } ], "summary": string }',
    "`issues` is empty when `pass` is true. `summary` is one short sentence.",
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      `View notes (metadata): ${JSON.stringify(views ?? {})}`,
      "The product reference sheet to inspect is attached. Return the verdict.",
    ].join("\n"),
    images: [sheetRef],
  };

  return [{ role: "system", content: system }, user];
}
