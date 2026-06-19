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
  "showcase vs demo → static hero/benefit framing = product-showcase; visible in-use function/steps = product-demo.",
  "testimonial vs spokesperson → genuine first-person CUSTOMER experience = testimonial; scripted/hosted pitch (incl. AI avatar) = spokesperson.",
  "brand-story vs brand-awareness → cinematic FILMED scenes = brand-story; typography/no footage, text-led = brand-awareness. (no product, no person, text-led → brand-awareness.)",
  "promo-offer vs announcement → has price/discount/urgency = promo-offer; new-thing/news without a deal = announcement.",
  "founder-pov vs testimonial → insider/founder ('why WE built') = founder-pov; customer ('I bought') = testimonial.",
].join("\n");
