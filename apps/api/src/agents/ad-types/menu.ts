// Detector menus, rendered from the SAME registry/hook catalog that backs the
// clamp + reconcile. The menu can never drift from the validated id set: adding
// a type (Chunk H) grows this menu automatically. Menu order = stable registry
// order (kept constant to avoid silent LLM position-bias shifts between deploys).

import type { AdTypeMenuItem } from "@ugc/shared";
import { REGISTRY } from "./registry.js";
import type { AdTypeDef, AssetRequirement } from "./types.js";
import { allHookIds, getHook, hookDefaultRole } from "./hooks/registry.js";

/**
 * The ad-type menu for the create-form dropdown (Chunk J) — id + displayName +
 * whenToUse + asset policy, in stable registry order. Grows automatically as
 * Chunk H registers new types.
 */
export function adTypeMenuList(): AdTypeMenuItem[] {
  return Object.values(REGISTRY).map((def: AdTypeDef) => ({
    id: def.id,
    displayName: def.displayName,
    whenToUse: def.whenToUse,
    assetPolicy: {
      product: def.assetPolicy.product,
      person: def.assetPolicy.person,
    },
  }));
}

const reqMark = (r: AssetRequirement): string =>
  r === "required" ? "R" : r === "forbidden" ? "x" : "o";

/** One AD_TYPE_MENU row per registered def, derived from its fields. */
export function renderAdTypeMenu(): string {
  const rows = Object.values(REGISTRY).map((def: AdTypeDef) => {
    const p = reqMark(def.assetPolicy.product);
    const person = reqMark(def.assetPolicy.person);
    return [
      `- ${def.id} | look: ${def.lookFamily} | product:${p} person:${person} |`,
      `${def.description} defaultHooks: ${def.defaultHooks.join(", ")}.`,
    ].join(" ");
  });
  return rows.join("\n");
}

/** One HOOK_MENU row per catalog hook (stable catalog order). */
export function renderHookMenu(): string {
  const rows = allHookIds().map((id) => {
    const h = getHook(id);
    const role = hookDefaultRole(id) === "visual_lead" ? "visual-lead" : "overlay";
    const needs = !h.worksWithoutPerson
      ? "person"
      : !h.worksWithoutProduct
        ? "product"
        : "none";
    return `- ${id} | role: ${role} | needs: ${needs} | ${h.description}`;
  });
  return rows.join("\n");
}

/**
 * The confusable-pair disambiguators (research/02 §2). Cross-type rules, so they
 * live here as a constant rather than on any single def. Placed AFTER the menu
 * in the prompt (gpt-4.1/Claude weight later instructions more heavily).
 */
export const CONFUSABLE_RULES = [
  "testimonial(UGC) vs founder-pov → a genuine first-person CUSTOMER review to camera = testimonial; the FOUNDER's own 'why we built it' insider story = founder-pov.",
  "brand-story vs inspirational → both are cinematic voiceover; a STRUCTURED through-story about the brand (values/origin/world/journey) = brand-story; an OPEN evocative mood/feeling montage with no required story = inspirational.",
  "product-demo vs lifestyle → visible in-use FUNCTION/steps with the product as the subject = product-demo; the product woven naturally into an aspirational real-life scene = lifestyle.",
  "testimonial vs lifestyle → a person REVIEWS the product to camera = testimonial; the product just LIVES in the scene with nobody reviewing it = lifestyle.",
].join("\n");
