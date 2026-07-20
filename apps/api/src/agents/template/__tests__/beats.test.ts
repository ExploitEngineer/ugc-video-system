import { describe, it, expect } from "vitest";

import type {
  RunTemplate,
  TemplatePlan,
  TemplateSlot,
} from "@ugc/shared";

import type { StoryboardScene } from "../../image/storyboard/prompt.js";
import { beatsToScenes, deriveTemplateBeats } from "../beats.js";
import { MASTER_CLIP_SECONDS } from "../geometry.js";

// A video slot with a resolved timeline window. Only the fields deriveTemplateBeats
// reads matter; the rest of TemplateSlot is filled to satisfy the type.
const vslot = (
  jobLayerName: string,
  startSec: number | null,
  durationSec: number | null,
): TemplateSlot =>
  ({
    asset: "VIDEO",
    composition: "main",
    layerName: jobLayerName,
    jobLayerName,
    injectVia: "asset",
    width: 1920,
    height: 1080,
    startSec,
    durationSec,
  }) as TemplateSlot;

const tpl = (slots: TemplateSlot[]): RunTemplate =>
  ({ slots }) as unknown as RunTemplate;

const plan = (scenes: Record<string, string>): TemplatePlan => ({
  conceptSummary: "a calm ceramic mug on a morning counter",
  slots: Object.entries(scenes).map(([jobLayerName, videoScene]) => ({
    jobLayerName,
    asset: "VIDEO" as const,
    role: "",
    videoScene,
  })),
});

describe("deriveTemplateBeats", () => {
  it("joins each slot's videoScene by jobLayerName, in time order", () => {
    const beats = deriveTemplateBeats(
      tpl([vslot("PH_1", 0, 2), vslot("PH_2", 2, 3)]),
      plan({ PH_1: "the mug fills", PH_2: "hands lift the mug" }),
    );
    expect(beats).toBeDefined();
    expect(beats?.map((b) => b.jobLayerName)).toEqual(["PH_1", "PH_2"]);
    expect(beats?.map((b) => b.scene)).toEqual([
      "the mug fills",
      "hands lift the mug",
    ]);
  });

  it("sorts by startSec regardless of slot order", () => {
    const beats = deriveTemplateBeats(
      tpl([vslot("late", 6, 3), vslot("early", 0, 3)]),
      plan({ late: "b", early: "a" }),
    );
    expect(beats?.map((b) => b.jobLayerName)).toEqual(["early", "late"]);
  });

  it("makes the shot list gapless — each beat runs to the next start, last to the end", () => {
    const beats = deriveTemplateBeats(
      tpl([vslot("PH_1", 0, 2), vslot("PH_2", 5, 3)]),
      plan({ PH_1: "a", PH_2: "b" }),
    );
    expect(beats?.[0]).toMatchObject({ startSec: 0, durationSec: 5 });
    expect(beats?.[1]).toMatchObject({
      startSec: 5,
      durationSec: MASTER_CLIP_SECONDS - 5,
    });
  });

  it("folds a sub-1.5s beat into the one before it", () => {
    const beats = deriveTemplateBeats(
      tpl([vslot("PH_1", 0, 5), vslot("PH_2", 5, 1), vslot("PH_3", 6, 4)]),
      plan({ PH_1: "a", PH_2: "b", PH_3: "c" }),
    );
    // PH_2 (1s on screen) is too fleeting for its own Seedance shot.
    expect(beats?.map((b) => b.jobLayerName)).toEqual(["PH_1", "PH_3"]);
  });

  it("caps the distinct beats at 6", () => {
    const slots = Array.from({ length: 8 }, (_, i) =>
      vslot(`PH_${i}`, i * 1.8, 1.8),
    );
    const scenes = Object.fromEntries(slots.map((s) => [s.jobLayerName, "x"]));
    const beats = deriveTemplateBeats(tpl(slots), plan(scenes));
    expect(beats?.length).toBeLessThanOrEqual(6);
    expect(beats?.length).toBe(6);
  });

  it("returns undefined for a single-video-slot template (stays generic)", () => {
    expect(
      deriveTemplateBeats(tpl([vslot("only", 0, 15)]), plan({ only: "a" })),
    ).toBeUndefined();
  });

  it("returns undefined when a window is unresolved", () => {
    expect(
      deriveTemplateBeats(
        tpl([vslot("PH_1", 0, 2), vslot("PH_2", null, null)]),
        plan({ PH_1: "a", PH_2: "b" }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined when the plan authored no scenes at all", () => {
    expect(
      deriveTemplateBeats(
        tpl([vslot("PH_1", 0, 2), vslot("PH_2", 2, 3)]),
        plan({ PH_1: "", PH_2: "" }),
      ),
    ).toBeUndefined();
  });
});

describe("beatsToScenes", () => {
  const beat = (startSec: number, durationSec: number, scene: string) => ({
    jobLayerName: "x",
    startSec,
    durationSec,
    scene,
  });

  const sbScene = (
    i: number,
    transcript: string,
    speaker?: StoryboardScene["speaker"],
  ): StoryboardScene => ({
    index: i,
    cameraAngle: `angle ${i}`,
    actionMovement: "",
    sceneDescription: `sb ${i}`,
    panelCaption: "",
    transcript,
    adStyle: "warm",
    ...(speaker ? { speaker } : {}),
  });

  it("prefers the product-grounded storyboard scene over the structural beat, borrowing the transcript by midpoint", () => {
    const storyboard = [sbScene(0, "line A"), sbScene(1, "line B")];
    // beat 0 midpoint 1s → first half → scene 0; beat 1 midpoint ~11s → scene 1.
    const scenes = beatsToScenes(
      [beat(0, 2, "beat one"), beat(8, 7, "beat two")],
      storyboard,
    );
    // The storyboard scene (authored from the user's REAL product) is the subject;
    // the beat text is now a subject-agnostic structural role from the blueprint and
    // must NOT reach the screen when the storyboard covers the window. This is what
    // stops a glasses ad from rendering the template's demo water bottle.
    expect(scenes[0]).toMatchObject({
      sceneDescription: "sb 0",
      transcript: "line A",
    });
    expect(scenes[1]).toMatchObject({
      sceneDescription: "sb 1",
      transcript: "line B",
    });
  });

  it("uses the structural beat text only when the storyboard scene has no description", () => {
    const blank: StoryboardScene = { ...sbScene(0, "line A"), sceneDescription: "" };
    const scenes = beatsToScenes([beat(0, 5, "structural beat")], [blank]);
    expect(scenes[0]).toMatchObject({
      sceneDescription: "structural beat",
      transcript: "line A",
    });
  });

  it("falls back to the beat text and an empty transcript when there is no storyboard", () => {
    const scenes = beatsToScenes([beat(0, 5, "solo beat")], []);
    expect(scenes[0]).toMatchObject({
      sceneDescription: "solo beat",
      transcript: "",
    });
  });

  it("a borrowed transcript keeps its speaker", () => {
    // The line and its owner must travel TOGETHER. If the speaker is dropped here
    // the line is re-orphaned and every multi-video-slot template (the common
    // case) silently loses per-line voicing — with no error anywhere.
    const woman = { id: "A", role: "the woman", voice: "warm woman in her 20s" };
    const man = { id: "B", role: "the man", voice: "calm man in his 30s" };
    const scenes = beatsToScenes(
      [beat(0, 2, "beat one"), beat(8, 7, "beat two")],
      [sbScene(0, "line A", woman), sbScene(1, "line B", man)],
    );
    expect(scenes[0]?.speaker).toEqual(woman);
    expect(scenes[1]?.speaker).toEqual(man);
  });

  it("omits the speaker key entirely for a scene that has none", () => {
    // Legacy rows (written before speakers existed) must stay byte-identical in
    // jsonb, so the key is ABSENT rather than an explicit undefined.
    const scenes = beatsToScenes([beat(0, 5, "solo")], [sbScene(0, "line")]);
    expect("speaker" in (scenes[0] as object)).toBe(false);
  });
});
