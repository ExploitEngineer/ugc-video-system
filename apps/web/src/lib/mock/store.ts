// In-memory mock of the run state machine for F2 (no real backend yet).
//
// One process-wide store, advanced on every status poll (`GET /api/runs/:id`)
// and mutated by the studio server actions (confirm / reject / cancel).
// The shapes returned are the real `RunDetail` DTOs from `@ugc/shared`, so
// when F3 lands the UI/query code is unchanged — only this module is swapped
// for calls to the Hono API.

import { randomUUID } from "node:crypto";
import type {
  Asset,
  AssetKind,
  CreateRunInput,
  RunDetail,
  Step,
  StepEvent,
  StepEventStatus,
} from "@ugc/shared";

/** Wall-clock a single step "runs" before its artifact is produced. */
const STEP_MS = 3000;

/** Sheet-producing steps → the artifact they emit. */
const STEP_ASSET: Partial<
  Record<Step, { kind: AssetKind; url: string; mime: string }>
> = {
  product_sheet: {
    kind: "product_sheet",
    url: "/mock/product-sheet.svg",
    mime: "image/svg+xml",
  },
  person_sheet: {
    kind: "person_sheet",
    url: "/mock/person-sheet.svg",
    mime: "image/svg+xml",
  },
  storyboard: {
    kind: "storyboard_sheet",
    url: "/mock/storyboard-sheet.svg",
    mime: "image/svg+xml",
  },
  video: {
    kind: "final_video",
    url: "/mock/final-video-poster.svg",
    mime: "image/svg+xml",
  },
};

type MockRun = {
  detail: RunDetail;
  plan: Step[];
  index: number;
  stepStartedAt: number;
};

// Survive Next dev HMR / multiple module evaluations.
const g = globalThis as unknown as { __ugcMockStore?: Map<string, MockRun> };
if (!g.__ugcMockStore) g.__ugcMockStore = new Map();
const runs: Map<string, MockRun> = g.__ugcMockStore;

function nowIso() {
  return new Date().toISOString();
}

/** Naive ad-style interpretation from the prompt (mirrors what the agent does). */
function interpretAdStyle(prompt: string): string {
  const p = prompt.toLowerCase();
  const table: Array<[RegExp, string]> = [
    [/ugc|testimonial|authentic|selfie/, "UGC"],
    [/luxury|premium|elegant|high.?end/, "luxury"],
    [/cinematic|film|dramatic|epic/, "cinematic"],
    [/minimal|clean|simple/, "minimalist"],
    [/fun|comedic|playful|quirky|meme/, "comedic"],
    [/inspir|uplifting|emotional/, "inspirational"],
  ];
  for (const [re, style] of table) if (re.test(p)) return style;
  return "cinematic";
}

function buildPlan(hasPersonImage: boolean, criticEnabled: boolean): Step[] {
  const plan: Step[] = ["product_sheet"];
  if (hasPersonImage) plan.push("person_sheet");
  if (criticEnabled) plan.push("product_inspection");
  plan.push("storyboard");
  if (criticEnabled) plan.push("storyboard_inspection");
  plan.push("video");
  return plan;
}

function addEvent(run: MockRun, step: Step, status: StepEventStatus) {
  const event: StepEvent = {
    id: randomUUID(),
    runId: run.detail.id,
    step,
    status,
    payload: null,
    createdAt: nowIso(),
  };
  run.detail.stepEvents.push(event);
}

function addAsset(run: MockRun, step: Step) {
  const spec = STEP_ASSET[step];
  if (!spec) return;
  // Idempotent across regeneration: drop any prior asset of this kind first.
  run.detail.assets = run.detail.assets.filter((a) => a.kind !== spec.kind);
  const asset: Asset = {
    id: randomUUID(),
    runId: run.detail.id,
    kind: spec.kind,
    url: spec.url,
    mime: spec.mime,
    meta:
      spec.kind === "final_video"
        ? { durationSec: 15, hasAudio: true, width: 1280, height: 720 }
        : { width: 1200, height: 900 },
    createdAt: nowIso(),
  };
  run.detail.assets.push(asset);
}

function touch(run: MockRun) {
  run.detail.updatedAt = nowIso();
}

function enterStep(run: MockRun, index: number, ts: number) {
  run.index = index;
  run.stepStartedAt = ts;
  run.detail.currentStep = run.plan[index];
  run.detail.status = "running";
  addEvent(run, run.plan[index], "started");
}

/** Finish the current step: emit its artifact + a `passed` audit event. */
function finalizeStep(run: MockRun) {
  const step = run.plan[run.index];
  addAsset(run, step);
  addEvent(run, step, "passed");
}

function goToNext(run: MockRun, ts: number) {
  if (run.index >= run.plan.length - 1) {
    run.detail.status = "completed";
    return;
  }
  enterStep(run, run.index + 1, ts);
}

/** Create a queued run; returns its id. */
export function createRun(input: CreateRunInput): string {
  const id = randomUUID();
  const plan = buildPlan(input.hasPersonImage, input.criticEnabled);
  const ts = nowIso();
  const detail: RunDetail = {
    id,
    projectId: randomUUID(),
    prompt: input.prompt,
    adStyle: interpretAdStyle(input.prompt),
    adType: /\b(inspir|cinematic|story|journey|dream)/i.test(input.prompt)
      ? "inspirational"
      : "ugc",
    mode: input.mode,
    criticEnabled: input.criticEnabled,
    status: "queued",
    currentStep: plan[0],
    error: null,
    createdAt: ts,
    updatedAt: ts,
    assets: [],
    stepEvents: [],
    scenes: null,
  };
  runs.set(id, { detail, plan, index: 0, stepStartedAt: 0 });
  return id;
}

/**
 * Advance the run based on elapsed time, then return its current detail.
 * Called on every poll. No-op once terminal or while awaiting confirmation.
 */
export function advanceRun(id: string): RunDetail | null {
  const run = runs.get(id);
  if (!run) return null;

  const status = run.detail.status;
  if (status === "completed" || status === "failed") return run.detail;
  if (status === "awaiting_confirmation") return run.detail;

  const now = Date.now();

  // First poll: leave the queue and start step 0.
  if (status === "queued") {
    enterStep(run, 0, now);
    touch(run);
    return run.detail;
  }

  // running | regenerating — produce the artifact once the step's time elapses.
  if (now - run.stepStartedAt >= STEP_MS) {
    finalizeStep(run);
    const isLast = run.index >= run.plan.length - 1;
    if (isLast) {
      run.detail.status = "completed";
    } else if (run.detail.mode === "confirm") {
      run.detail.status = "awaiting_confirmation";
    } else {
      goToNext(run, now);
    }
    touch(run);
  }
  return run.detail;
}

/** Confirm the awaiting step → advance (confirm mode). */
export function confirmStep(id: string): RunDetail | null {
  const run = runs.get(id);
  if (!run) return null;
  if (run.detail.status !== "awaiting_confirmation") return run.detail;
  goToNext(run, Date.now());
  touch(run);
  return run.detail;
}

/** Reject the awaiting step → regenerate it. */
export function rejectStep(id: string): RunDetail | null {
  const run = runs.get(id);
  if (!run) return null;
  if (run.detail.status !== "awaiting_confirmation") return run.detail;
  addEvent(run, run.plan[run.index], "regenerated");
  run.detail.status = "regenerating";
  run.stepStartedAt = Date.now();
  touch(run);
  return run.detail;
}

/** Cancel a run → terminal failure. */
export function cancelRun(id: string): RunDetail | null {
  const run = runs.get(id);
  if (!run) return null;
  if (run.detail.status === "completed" || run.detail.status === "failed")
    return run.detail;
  run.detail.status = "failed";
  run.detail.error = "Run cancelled.";
  touch(run);
  return run.detail;
}

export function getRun(id: string): RunDetail | null {
  return runs.get(id)?.detail ?? null;
}
