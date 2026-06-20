/**
 * Offline prompt-inspection harness (dev only — no network, no API keys).
 *
 * Composes and prints the EXACT authored instructions the pipeline sends to the
 * planner LLMs for a given ad type, so prompt-prose edits (skills/<id>.skill.md,
 * fragments/looks.ts, hook openings, the builders) can be SEEN and verified
 * before any live generation spends OpenAI/BytePlus credits.
 *
 * It calls the real builders (`buildStoryboardPrompt`, `buildVideoPrompt`,
 * `buildDeterministicVideoPrompt`) with stub params — same code path as a run,
 * minus the network. The final provider prompt is still LLM-written from these
 * instructions; what we tune (and what this dumps) is the instructions.
 *
 * Usage (from apps/api):
 *   pnpm exec tsx scripts/dump-prompt.ts --type product-demo
 *   pnpm exec tsx scripts/dump-prompt.ts --type testimonial --duration 15 --aspect 9:16
 *   pnpm exec tsx scripts/dump-prompt.ts --all            # every ad type, video deterministic only
 *   pnpm exec tsx scripts/dump-prompt.ts --type explainer --prompt "How my budgeting app works"
 *
 * Flags: --type <id> | --all, --prompt <text>, --duration <15|30|45|60>,
 *        --aspect <16:9|9:16>, --product / --no-product, --person / --no-person.
 */

import type { AspectRatio } from "@ugc/shared";
import {
  buildStoryboardPrompt,
  type StoryboardScene,
} from "../src/agents/image/storyboard/prompt.js";
import {
  buildDeterministicVideoPrompt,
  buildVideoPrompt,
} from "../src/agents/video/prompt.js";
import { resolveHooks } from "../src/agents/ad-types/hooks/compose.js";
import { allAdTypeIds, getAdType } from "../src/agents/ad-types/registry.js";
import { videoNegatives } from "../src/agents/ad-types/fragments/looks.js";

// ── tiny argv parser ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function bool(name: string): boolean {
  return argv.includes(`--${name}`);
}

const aspect = (flag("aspect") as AspectRatio) ?? "16:9";
const durationSec = Number(flag("duration") ?? "15");
const userPrompt =
  flag("prompt") ?? "Show off this product in a short, scroll-stopping ad.";

const HR = "═".repeat(78);
const hr = "─".repeat(78);

/** Four generic storyboard scenes — placeholders so the video builders splice. */
function sampleScenes(adStyle: string): StoryboardScene[] {
  const beats = [
    { cam: "medium shot", desc: "Open on the subject, establishing the moment." },
    { cam: "close-up", desc: "The key action happens, product/feature in focus." },
    { cam: "wide shot", desc: "The payoff lands, reaction or result shown." },
    { cam: "medium close-up", desc: "Closing beat, the takeaway." },
  ];
  return beats.map((b, i) => ({
    index: i + 1,
    cameraAngle: b.cam,
    actionMovement: "natural motion within the frame",
    sceneDescription: b.desc,
    panelCaption: `PANEL ${i + 1}. ${b.desc}`,
    transcript: `Line ${i + 1} the on-screen voice says here.`,
    adStyle,
  }));
}

function dumpMessages(label: string, msgs: { role: string; content: string }[]) {
  console.log(`\n${hr}\n${label}\n${hr}`);
  for (const m of msgs) {
    console.log(`\n[${m.role.toUpperCase()}]\n${m.content}`);
  }
}

function dumpType(id: string, opts: { videoOnly?: boolean } = {}) {
  const def = getAdType(id);
  const policy = def.assetPolicy;
  // Representative asset case (overridable): a product-required type assumes an
  // uploaded product; a person-required type assumes a (synthesized) person.
  const hasProduct = bool("no-product")
    ? false
    : bool("product")
      ? true
      : policy.product === "required";
  const hasPerson = bool("no-person")
    ? false
    : bool("person")
      ? true
      : policy.person === "required";
  const adStyle = "clean, neutral commercial";
  const hooks = resolveHooks(def, def.defaultHooks, { hasProduct, hasPerson });
  const scenes = sampleScenes(adStyle);

  console.log(`\n\n${HR}`);
  console.log(
    `AD TYPE: ${id}  (look=${def.lookFamily}, product=${policy.product}, person=${policy.person})`,
  );
  console.log(
    `hasProduct=${hasProduct} hasPerson=${hasPerson} duration=${durationSec}s aspect=${aspect}`,
  );
  console.log(
    `hooks: visualLead=${hooks.visualLead.id}${hooks.overlay ? ` overlay=${hooks.overlay.id}` : ""}`,
  );
  console.log(HR);

  if (!opts.videoOnly) {
    const storyboard = buildStoryboardPrompt({
      adStyle,
      adType: id,
      hooks,
      hasProduct,
      productBrief: hasProduct
        ? 'A matte-black product with the wordmark "ACME" printed on the front.'
        : "",
      personBrief: hasPerson ? "woman, late 20s, shoulder-length brown hair" : "",
      userPrompt,
      hasPerson,
      aspectRatio: aspect,
    });
    dumpMessages("STORYBOARD PROMPT (gpt-image-2 planner instructions)", storyboard);
  }

  const video = buildVideoPrompt({
    adStyle,
    adType: id,
    hooks,
    hasPerson,
    userPrompt,
    scenes,
    durationSec,
    aspectRatio: aspect,
    characterAnchor: hasPerson ? "woman, late 20s, brown hair" : undefined,
    hasProductSheet: hasProduct,
  });
  dumpMessages("VIDEO PROMPT (Seedance 2.0 planner instructions)", video);

  const deterministic = buildDeterministicVideoPrompt({
    adStyle,
    adType: id,
    scenes,
    durationSec,
    aspectRatio: aspect,
    characterAnchor: hasPerson ? "woman, late 20s, brown hair" : undefined,
    hasProductSheet: hasProduct,
  });
  console.log(
    `\n${hr}\nVIDEO PROMPT — DETERMINISTIC FALLBACK (the literal Seedance string)\n${hr}\n${deterministic}`,
  );

  // The runtime tail appended in video/index.ts AFTER the LLM/deterministic body.
  const isGraphic = def.lookFamily === "graphic_text";
  const renderDirective = isGraphic
    ? "Render clean animated motion-graphics frames (no people, no live footage, no camera). Reproduce the board's typography, layout and brand colour but NEVER render its panel-number badges, grid lines, borders or caption/description bars."
    : "Render ONE continuous live-action take with no cuts. The storyboard is a LOOK reference — reproduce its framing and identity but NEVER render its panel-number badges, grid lines, split-screen dividers, before/after labels, borders or bottom caption bars.";
  const cameraFixed = isGraphic ? "" : " --camerafixed true";
  console.log(
    `\n${hr}\nRUNTIME TAIL (video/index.ts: renderDirective + per-LOOK negatives + camerafixed)\n${hr}\n[renderDirective] ${renderDirective}\n[negatives] ${videoNegatives(def.lookFamily)}${cameraFixed ? `\n[suffix] ${cameraFixed.trim()}` : ""}`,
  );
}

// ── main ──────────────────────────────────────────────────────────────────
if (bool("all")) {
  for (const id of allAdTypeIds()) dumpType(id, { videoOnly: true });
} else {
  const type = flag("type");
  if (!type) {
    console.error(
      "Pass --type <adTypeId> (or --all). Known ids:\n  " +
        allAdTypeIds().join(", "),
    );
    process.exit(1);
  }
  if (!allAdTypeIds().includes(type)) {
    console.error(`Unknown ad type "${type}". Known ids:\n  ${allAdTypeIds().join(", ")}`);
    process.exit(1);
  }
  dumpType(type);
}
