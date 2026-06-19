import { describe, it, expect } from "vitest";

import baseline from "./__fixtures__/legacy-prompts.json" with { type: "json" };
import {
  buildStoryboardPrompt,
  type StoryboardScene,
} from "../../image/storyboard/prompt.js";
import {
  buildDeterministicVideoPrompt,
  buildVideoPrompt,
} from "../../video/prompt.js";
import { buildNarrativeOutlinePrompt } from "../../creative-direction/narrative-outline/prompt.js";
import { getAdType } from "../registry.js";

// Chunk F replaced the binary `adType === "ugc"` branches with registry fragment
// dispatch. The two legacy ids alias-resolve to testimonial / brand-story whose
// fragments carry the VERBATIM legacy text, so with NO hook spliced the prompts
// must be byte-identical to the pre-refactor output captured in the fixture.

type Msg = { role: string; content: string };
const flat = (msgs: Msg[]) =>
  msgs.map((m) => `[${m.role}]\n${m.content}`).join("\n\n=====\n\n");

const fixture = baseline as Record<string, string>;

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
const userPrompt = "Show off my water bottle for the gym.";
const adStyle = "warm, candid, phone-shot energy";
const scenes: StoryboardScene[] = [
  { index: 1, cameraAngle: "medium shot", actionMovement: "holds up bottle", sceneDescription: "Medium shot; she holds the matte bottle up to camera by the window.", panelCaption: "MEDIUM SHOT. Holding up the bottle to camera.", transcript: "Okay this bottle actually changed my gym routine.", adStyle: "warm, candid" },
  { index: 2, cameraAngle: "close-up", actionMovement: "twists off cap", sceneDescription: "Close-up; she twists off the bamboo cap and sets it down.", panelCaption: "CLOSE-UP. Twisting off the bamboo cap.", transcript: "The cap is bamboo and it never leaks in my bag.", adStyle: "warm, candid" },
  { index: 3, cameraAngle: "medium close-up", actionMovement: "drinks", sceneDescription: "Medium close-up; she drinks and the water level drops.", panelCaption: "MEDIUM CLOSE-UP. Drinking as the water level drops.", transcript: "Keeps my water cold through a whole workout.", adStyle: "warm, candid" },
  { index: 4, cameraAngle: "medium shot", actionMovement: "smiles to camera", sceneDescription: "Medium shot; she smiles at camera holding the bottle.", panelCaption: "MEDIUM SHOT. Smiling with the bottle.", transcript: "Honestly the best gym bottle I have owned.", adStyle: "warm, candid" },
];

const LEGACY = ["ugc", "inspirational"] as const;

describe("Chunk F — legacy prompts are byte-identical (no hook spliced)", () => {
  for (const adType of LEGACY) {
    it(`storyboard ${adType} (person + use)`, () => {
      const out = flat(
        buildStoryboardPrompt({ adStyle, adType, productBrief, productUse, personBrief, userPrompt, hasPerson: true, aspectRatio: "16:9" }),
      );
      expect(out).toBe(fixture[`storyboard.${adType}.personUse`]);
    });

    it(`storyboard ${adType} (no person, no use)`, () => {
      const out = flat(
        buildStoryboardPrompt({ adStyle, adType, productBrief: "", personBrief: "", userPrompt, hasPerson: false, aspectRatio: "16:9" }),
      );
      expect(out).toBe(fixture[`storyboard.${adType}.noPersonNoUse`]);
    });

    it(`video LLM ${adType} (anchor + product sheet)`, () => {
      const out = flat(
        buildVideoPrompt({ adStyle, adType, hasPerson: adType === "ugc", userPrompt, scenes, durationSec: 15, aspectRatio: "16:9", characterAnchor: "a woman in her late 20s, athletic", hasProductSheet: true }),
      );
      expect(out).toBe(fixture[`video.${adType}.llm`]);
    });

    it(`video LLM ${adType} (no anchor, no product sheet)`, () => {
      const out = flat(
        buildVideoPrompt({ adStyle, adType, hasPerson: adType === "ugc", userPrompt, scenes, durationSec: 15, aspectRatio: "16:9", hasProductSheet: false }),
      );
      expect(out).toBe(fixture[`video.${adType}.llmNoAnchor`]);
    });

    it(`video deterministic ${adType} (anchor)`, () => {
      const out = buildDeterministicVideoPrompt({ adStyle, adType, scenes, durationSec: 15, aspectRatio: "16:9", characterAnchor: "a woman in her late 20s, athletic", hasProductSheet: true });
      expect(out).toBe(fixture[`video.${adType}.deterministic`]);
    });

    it(`video deterministic ${adType} (no anchor — exercises videoVoice)`, () => {
      const out = buildDeterministicVideoPrompt({ adStyle, adType, scenes, durationSec: 15, aspectRatio: "16:9", hasProductSheet: false });
      expect(out).toBe(fixture[`video.${adType}.deterministicNoAnchor`]);
    });

    it(`narrative ${adType}`, () => {
      const out = flat(
        buildNarrativeOutlinePrompt({ adStyle, adType, productBrief, productUse, personBrief, userPrompt }),
      );
      expect(out).toBe(fixture[`narrative.${adType}`]);
    });
  }
});

describe("Chunk F — fragment values moved verbatim", () => {
  it("videoVoice matches the deleted VOICE map", () => {
    const stub = { adStyle: "x", productBrief: null, personBrief: null, hasProduct: true, hasPerson: true, duration: 15 as const, segmentIndex: null, segmentCount: 1 };
    expect(getAdType("ugc").fragments.videoVoice(stub)[0]).toBe("a warm, conversational, natural-sounding voice");
    expect(getAdType("inspirational").fragments.videoVoice(stub)[0]).toBe("a calm, measured narrator");
  });
});

describe("Chunk F — hook splice only when a hook is present", () => {
  const hooks = {
    visualLead: { id: "problem-solution", role: "visual_lead" as const, openingDirective: "Open on the frustration." },
    overlay: null,
  };

  it("storyboard with a hook adds the scene-1 hook block", () => {
    const withHook = flat(buildStoryboardPrompt({ adStyle, adType: "ugc", hooks, productBrief, productUse, personBrief, userPrompt, hasPerson: true, aspectRatio: "16:9" }));
    expect(withHook).toContain("OPENING HOOK — applies ONLY to scene 1");
    expect(withHook).toContain("Open on the frustration.");
    // without the hook → no hook block (byte-identical baseline already asserts this)
    expect(fixture["storyboard.ugc.personUse"]).not.toContain("OPENING HOOK");
  });

  it("video with a hook adds the first-slice hook directive", () => {
    const withHook = flat(buildVideoPrompt({ adStyle, adType: "ugc", hooks, hasPerson: true, userPrompt, scenes, durationSec: 15, aspectRatio: "16:9", characterAnchor: "a woman", hasProductSheet: true }));
    expect(withHook).toContain("OPENING HOOK (first time-slice only):");
  });
});
