/**
 * Re-lock the `storyboard.*` + `video.*` keys in the legacy-prompts.json
 * regression baseline after INTENTIONAL prompt-builder changes (Batch 1/2 prompt
 * tuning). narrative.* keys are left untouched (the narrative builder is
 * unchanged) so the test still validates them against the original baseline.
 *
 * Inputs MUST match fragment-regression.test.ts exactly.
 * Run from apps/api:  pnpm exec tsx scripts/regen-legacy-fixtures.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDeterministicVideoPrompt,
  buildVideoPrompt,
} from "../src/agents/video/prompt.js";
import {
  buildStoryboardPrompt,
  type StoryboardScene,
} from "../src/agents/image/storyboard/prompt.js";

type Msg = { role: string; content: string };
const flat = (msgs: Msg[]) =>
  msgs.map((m) => `[${m.role}]\n${m.content}`).join("\n\n=====\n\n");

const adStyle = "warm, candid, phone-shot energy";
const userPrompt = "Show off my water bottle for the gym.";
const productBrief =
  "A matte black stainless-steel water bottle with a bamboo screw cap.";
const personBrief =
  "A woman in her late 20s, athletic build, casual activewear, natural makeup.";
const productUse = {
  accessVerb: "twists off the bamboo cap",
  changedState: "cap off, set on the counter",
  persistenceCue: "cap still off beside her",
  functionSignal: "the water level visibly drops as she drinks",
  useVerb: "drinks from",
};
const scenes: StoryboardScene[] = [
  { index: 1, cameraAngle: "medium shot", actionMovement: "holds up bottle", sceneDescription: "Medium shot; she holds the matte bottle up to camera by the window.", panelCaption: "MEDIUM SHOT. Holding up the bottle to camera.", transcript: "Okay this bottle actually changed my gym routine.", adStyle: "warm, candid" },
  { index: 2, cameraAngle: "close-up", actionMovement: "twists off cap", sceneDescription: "Close-up; she twists off the bamboo cap and sets it down.", panelCaption: "CLOSE-UP. Twisting off the bamboo cap.", transcript: "The cap is bamboo and it never leaks in my bag.", adStyle: "warm, candid" },
  { index: 3, cameraAngle: "medium close-up", actionMovement: "drinks", sceneDescription: "Medium close-up; she drinks and the water level drops.", panelCaption: "MEDIUM CLOSE-UP. Drinking as the water level drops.", transcript: "Keeps my water cold through a whole workout.", adStyle: "warm, candid" },
  { index: 4, cameraAngle: "medium shot", actionMovement: "smiles to camera", sceneDescription: "Medium shot; she smiles at camera holding the bottle.", panelCaption: "MEDIUM SHOT. Smiling with the bottle.", transcript: "Honestly the best gym bottle I have owned.", adStyle: "warm, candid" },
];

const path = join(
  import.meta.dirname,
  "../src/agents/ad-types/__tests__/__fixtures__/legacy-prompts.json",
);
const fixture = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;

for (const adType of ["ugc", "inspirational"] as const) {
  const hasPerson = adType === "ugc";
  fixture[`storyboard.${adType}.personUse`] = flat(
    buildStoryboardPrompt({ adStyle, adType, productBrief, productUse, personBrief, userPrompt, hasPerson: true, aspectRatio: "16:9" }),
  );
  fixture[`storyboard.${adType}.noPersonNoUse`] = flat(
    buildStoryboardPrompt({ adStyle, adType, productBrief: "", personBrief: "", userPrompt, hasPerson: false, aspectRatio: "16:9" }),
  );
  fixture[`video.${adType}.llm`] = flat(
    buildVideoPrompt({ adStyle, adType, hasPerson, userPrompt, scenes, durationSec: 15, aspectRatio: "16:9", characterAnchor: "a woman in her late 20s, athletic", hasProductSheet: true }),
  );
  fixture[`video.${adType}.llmNoAnchor`] = flat(
    buildVideoPrompt({ adStyle, adType, hasPerson, userPrompt, scenes, durationSec: 15, aspectRatio: "16:9", hasProductSheet: false }),
  );
  fixture[`video.${adType}.deterministic`] = buildDeterministicVideoPrompt({ adStyle, adType, scenes, durationSec: 15, aspectRatio: "16:9", characterAnchor: "a woman in her late 20s, athletic", hasProductSheet: true });
  fixture[`video.${adType}.deterministicNoAnchor`] = buildDeterministicVideoPrompt({ adStyle, adType, scenes, durationSec: 15, aspectRatio: "16:9", hasProductSheet: false });
}

writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log("Regenerated video.* keys in legacy-prompts.json");
