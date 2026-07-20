import { describe, expect, it } from "vitest";

import type { SceneSpeaker } from "../../../image/storyboard/prompt.js";
import {
  buildDeterministicTemplateVideoPrompt,
  buildTemplateVideoPrompt,
  buildVoiceBlock,
  castOf,
  type TemplateVideoPromptInput,
  type TemplateVideoScene,
} from "../prompt.js";

const WOMAN: SceneSpeaker = {
  id: "A",
  role: "the woman",
  voice: "warm, upbeat woman in her late 20s, light American accent",
};
const MAN: SceneSpeaker = {
  id: "B",
  role: "the man",
  voice: "calm man in his 30s, neutral accent",
};

const scene = (
  sceneDescription: string,
  transcript: string,
  speaker?: SceneSpeaker,
): TemplateVideoScene => ({
  sceneDescription,
  transcript,
  cameraAction: "slow push-in",
  ...(speaker ? { speaker } : {}),
});

const input = (
  scenes: TemplateVideoScene[],
  cast?: SceneSpeaker[],
): TemplateVideoPromptInput => ({
  userPrompt: "sell the app",
  aspectRatio: "16:9",
  durationSec: 12,
  hasPerson: true,
  scenes,
  slotWindows: scenes.map((_, i) => ({ startSec: i * 4, durationSec: 4 })),
  ...(cast ? { cast } : {}),
});

const text = (msgs: { content: string }[]) => msgs.map((m) => m.content).join("\n");

describe("castOf", () => {
  it("dedupes by id and keeps first-appearance order", () => {
    const cast = castOf([
      scene("a", "one", WOMAN),
      scene("b", "two", MAN),
      scene("c", "three", WOMAN),
    ]);
    expect(cast.map((c) => c.id)).toEqual(["A", "B"]);
  });

  it("excludes a speaker with no line — a silent extra earns no voice", () => {
    // Describing a voice for someone who never talks spends tokens AND invites the
    // model to give them one.
    const cast = castOf([scene("a", "", WOMAN), scene("b", "two", MAN)]);
    expect(cast.map((c) => c.id)).toEqual(["B"]);
  });

  it("is empty when nobody is attributed", () => {
    expect(castOf([scene("a", "a line")])).toEqual([]);
  });
});

describe("buildVoiceBlock", () => {
  it("is byte-identical for every segment of one run", () => {
    // THE anchor test. A merged ad generates each segment separately; the voice
    // descriptor must arrive at Seedance character-for-character the same each
    // time or the character's voice changes mid-ad (research/04). Identity is
    // guaranteed because the block is built once from the run-level cast and never
    // routed through the LLM, which would paraphrase it.
    const cast = castOf([scene("a", "one", WOMAN), scene("b", "two", MAN)]);
    const perSegment = [0, 1, 2].map(() => buildVoiceBlock(cast));
    expect(new Set(perSegment).size).toBe(1);
  });

  it("names each speaker's voice and forbids swapping them", () => {
    const block = buildVoiceBlock([WOMAN, MAN]);
    expect(block).toContain("the woman: warm, upbeat woman in her late 20s");
    expect(block).toContain("the man: calm man in his 30s");
    expect(block).toMatch(/never swap these voices/i);
    expect(block).toMatch(/spoken ONLY by the person named before it/i);
  });

  it("keeps the single-voice instruction for a one-speaker ad", () => {
    const block = buildVoiceBlock([WOMAN]);
    expect(block).toMatch(/ONE single voice for the whole clip/i);
    expect(block).not.toMatch(/never swap/i);
  });

  it("is empty when nobody speaks — the prompt is unchanged from before speakers", () => {
    expect(buildVoiceBlock([])).toBe("");
  });
});

describe("buildTemplateVideoPrompt — per-line attribution", () => {
  it("prefixes a line with its speaker's role, not a bare 'voiceover'", () => {
    const t = text(
      buildTemplateVideoPrompt(
        input([scene("she taps the phone", "It just works.", WOMAN)], [WOMAN, MAN]),
      ),
    );
    expect(t).toContain('(the woman: "It just works.")');
    expect(t).not.toContain('(voiceover: "It just works.")');
  });

  it("renders an unattributed line as the byte-identical legacy string", () => {
    // Single-speaker output must not change just because the feature exists.
    const t = text(buildTemplateVideoPrompt(input([scene("a shot", "A line.")])));
    expect(t).toContain('(voiceover: "A line.")');
  });

  it("drops ONE-single-voice and forbids reassignment when two people speak", () => {
    const t = text(
      buildTemplateVideoPrompt(
        input([scene("a", "one", WOMAN), scene("b", "two", MAN)], [WOMAN, MAN]),
      ),
    );
    expect(t).toMatch(/KEEP its speaker prefix EXACTLY/i);
    expect(t).toMatch(/never reassign a line/i);
    expect(t).not.toMatch(/ONE single voice for the whole clip/i);
  });

  it("keeps ONE-single-voice for a one-speaker ad", () => {
    const t = text(buildTemplateVideoPrompt(input([scene("a", "one", WOMAN)], [WOMAN])));
    expect(t).toMatch(/ONE single voice for the whole clip/i);
  });

  it("never lets the LLM describe a voice — the frozen block owns that", () => {
    // A second, paraphrased descriptor would contradict the block and drift
    // between segments, which is the whole reason the block bypasses the LLM.
    for (const cast of [[WOMAN], [WOMAN, MAN]]) {
      const t = text(buildTemplateVideoPrompt(input([scene("a", "one", WOMAN)], cast)));
      expect(t).toMatch(/Do NOT describe what (any|the) voice sounds like/i);
    }
  });
});

describe("buildDeterministicTemplateVideoPrompt", () => {
  it("carries per-line attribution too", () => {
    // The fallback shares `shotList`, so it gets speakers for free.
    const body = buildDeterministicTemplateVideoPrompt(
      input([scene("she taps", "It just works.", WOMAN)], [WOMAN, MAN]),
    );
    expect(body).toContain('(the woman: "It just works.")');
  });

  it("states no voice of its own — index.ts prepends the frozen block to it", () => {
    // Restating it here would double up and, for two speakers, contradict the block.
    const body = buildDeterministicTemplateVideoPrompt(
      input([scene("a", "one", WOMAN), scene("b", "two", MAN)], [WOMAN, MAN]),
    );
    expect(body).not.toMatch(/ONE single voice/i);
  });
});
