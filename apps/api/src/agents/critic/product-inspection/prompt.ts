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
  /** The product sheet to inspect, attached as a vision image (Image 1). */
  sheetRef: ImageRef;
  /** The ORIGINAL uploaded product photo — ground truth, attached as Image 2. */
  productUpload: ImageRef;
  /** Factual product identity anchor (text) from `runs.product_brief`. */
  productBrief: string;
}

export function buildProductInspectionPrompt({
  adStyle,
  userPrompt,
  views,
  sheetRef,
  productUpload,
  productBrief,
}: ProductInspectionPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const product = productBrief.trim();

  const system = [
    "You are the Product Sheet Inspection skill of an ad-video Critic Agent.",
    "Two images are attached: Image 1 = the generated PRODUCT REFERENCE SHEET to",
    "inspect; Image 2 = the ORIGINAL uploaded product photo (the GROUND TRUTH).",
    "Judge whether the sheet faithfully reproduces the real product AND is fit to",
    "drive the rest of the pipeline, then return a strict-JSON verdict. Be strict",
    "but fair: only fail on real, visible defects — not stylistic preference.",
    ...(product
      ? [
          "",
          "THE PRODUCT IS (authoritative identity — Image 1 must show THIS item):",
          product,
        ]
      : []),
    "",
    "RUBRIC — the sheet must satisfy ALL of:",
    "1. Exactly FOUR views in a clean 2×2 grid: top-left FRONT, top-right",
    "   THREE-QUARTER, bottom-left SIDE (profile), bottom-right REAR.",
    "2. It must be the SAME product as Image 2 (the real upload) — same kind of",
    "   item, colors, materials, finish, surface details, on-product logos/text",
    "   and proportions — and identical across all four cells. A sheet showing a",
    "   DIFFERENT product than the upload is a `blocking`, `global` issue.",
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
      "Image 1 is the generated product sheet to inspect; Image 2 is the original",
      "uploaded product photo (ground truth). Return the verdict.",
    ].join("\n"),
    // Order MUST match the legend above: generated sheet, then the real upload.
    images: [sheetRef, productUpload],
  };

  return [{ role: "system", content: system }, user];
}
