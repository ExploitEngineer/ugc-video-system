// Template Image prompt — one still per fillable IMAGE slot.
//
// A slot only reaches this point when the deterministic heuristic called it
// `content` AND the plan agent said what to depict. Logos, backgrounds and
// textures never get here.
//
// The still must belong to the SAME ad as the clip and the copy, which is why
// the subject comes from `template_plan` rather than from the raw user prompt,
// and why the product reference sheet is passed as an `images.edit` reference
// (identity-locking the actual product) rather than described in words.
//
// Realism note, from `gpt-image-2-prompting`: this pipeline's failure mode is
// OVER-texturing, not plastic. Do not ask for "visible pores", "maximum detail"
// or "film grain" — those summon the AI-render look. Ask for the photograph.

/** How the still is framed, inferred from the slot's shape. */
export type SlotShape = "landscape" | "portrait" | "square";

export function slotShape(width?: number | null, height?: number | null): SlotShape {
  if (!width || !height) return "square";
  const r = width / height;
  if (r > 1.2) return "landscape";
  if (r < 0.83) return "portrait";
  return "square";
}

const FRAMING: Record<SlotShape, string> = {
  landscape:
    "Compose for a WIDE frame: the subject sits off-centre with room to its side, nothing important near the edges.",
  portrait:
    "Compose for a TALL frame: the subject fills the vertical, with headroom above and space below.",
  square:
    "Compose for a SQUARE frame: the subject centred, evenly margined.",
};

export interface TemplateImagePromptInput {
  /** From `template_plan` — what this specific slot should depict. */
  imageSubject: string;
  /** From `template_plan` — what the slot is FOR in this ad. */
  role?: string;
  /** The through-line every slot in this template shares. */
  conceptSummary?: string;
  /** The vision look-bible (+ sampled palette) — how the still MATCHES the template. */
  visualStyle?: string;
  adStyle?: string;
  productBrief?: string;
  brandText?: string;
  /** True when a product reference sheet is passed as an edit reference. */
  hasProductRef: boolean;
  width?: number | null;
  height?: number | null;
}

export function buildTemplateImagePrompt(
  input: TemplateImagePromptInput,
): string {
  const shape = slotShape(input.width, input.height);

  const lines: string[] = [
    "A single photograph for an advertisement.",
    "",
    `SUBJECT: ${input.imageSubject}`,
  ];

  if (input.role) lines.push(`This still is ${input.role} in the ad.`);
  if (input.conceptSummary) lines.push(`The ad's through-line: ${input.conceptSummary}`);
  // The look-bible (with the sampled colour palette) is how the still MATCHES the
  // template; fall back to the ad-style string when no bible was derived.
  const look = input.visualStyle?.trim() || input.adStyle?.trim();
  if (look) lines.push(`Match this template look and colour palette exactly: ${look}.`);

  if (input.hasProductRef) {
    // The reference image is the product's identity. Words cannot re-specify a
    // shape, a glaze or a label as accurately as the sheet already does, and
    // trying to invites the model to invent a different product.
    lines.push(
      "",
      "The reference image shows the EXACT product. Reproduce its shape, colour,",
      "proportions, material and any markings precisely. Do not restyle it, do not",
      "redesign its label, do not change its silhouette.",
    );
  } else if (input.productBrief) {
    lines.push("", `The product: ${input.productBrief}`);
  }

  if (input.brandText) lines.push("", `Brand guidelines: ${input.brandText}`);

  lines.push(
    "",
    FRAMING[shape],
    "",
    // Photographic language, not render language. Naming the camera and the
    // light is what pulls the output away from the CGI look.
    "Shot on a full-frame camera with an 85mm lens at a natural perspective.",
    "Soft, directional, physically plausible light with gentle falloff and a",
    "neutral white balance. Natural colour, true skin and material tones, no",
    "orange or magenta cast. Real depth of field. Clean, uncluttered composition.",
    "If a person appears, render smooth, healthy, even skin with balanced tone —",
    "soft and real, never waxy, plastic, airbrushed or over-textured.",
    "",
    "No text, no logos, no watermarks, no captions, no borders, no collage, no",
    "split panels — a single uninterrupted photograph.",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}
