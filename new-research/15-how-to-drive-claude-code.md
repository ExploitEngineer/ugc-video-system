# 15 — How to Drive Claude Code Through This Refactor

> Direct answer to: *"How should I tell Claude to refactor every part? Should I mention this research?"*

---

## Short answers

- **Yes, give Claude Code the research — but as files in the repo, not pasted into chat.** Drop the relevant notes into the repo (you already have `research/` and `docs/`), and point Claude Code at them as authoritative context. Pasting walls of text into the chat each time wastes its context and drifts.
- **Do NOT ask for one big-bang refactor.** Go phase by phase (the 5 phases in [[13-refactor-master-plan]]), one PR each, verify, then next. A single mega-diff across prompts + state machine + hooks will be unreviewable and will regress.
- **Give it guardrails, not just tasks.** Claude Code will "helpfully" re-add `visible pores` because that reads as "more realistic." You must explicitly forbid the things you're removing.

---

## Step 0 — Put the context in the repo

Copy these into the repo so Claude Code can read them (suggested `docs/refactor/`):
- `13-refactor-master-plan.md`, `14-hooks-redesign.md` (this plan)
- `01-issues-diagnosis.md`, `04-gpt-image-2-guide.md`, `05-seedance-2.0-guide.md`, `03-prompting-formula-review.md` (the grounding research)

Then add a short pointer in `CLAUDE.md` (the repo already has one) so every Claude Code session picks it up:

```md
## Active refactor
We are fixing ad realism. Authoritative plan: docs/refactor/13-refactor-master-plan.md.
HARD RULES (do not violate, even if it seems "more realistic"):
- NEVER add: "visible pores", "no skin smoothing", "film grain"/"digital noise" on faces,
  "8k", "hyper-detailed", "render at full detail", "unretouched".
- ALWAYS include neutral white balance + a controlled lighting line on any face prompt.
- One Seedance beat = one camera move + one action; never the word "fast".
- gpt-image imagePrompt <= 90 words; Seedance videoPrompt <= 80 words.
- When you change fragment prose, UPDATE the golden tests in the same PR.
```

---

## The workflow per phase

For each phase: **one branch, one PR, verify, merge.**

1. Point Claude Code at the phase section + the grounding file.
2. Let it make the change.
3. Run the existing diagnostic scripts against a REAL run (they hit paid APIs — run explicitly):
   ```bash
   pnpm --filter api agents:verify <runId>   # product ∥ person → storyboard
   pnpm --filter api video:verify  <runId>   # storyboard → final video
   pnpm --filter api cda:verify    <runId>   # drive one run end-to-end
   ```
4. **Eyeball the output** — skin smoothness, redness, angles (Phase 1); cut/morph behavior (Phase 2); clean reference (Phase 3). Automated tests won't catch realism.
5. Merge, then next phase.

### ⚠ The test gotcha (tell Claude Code up front)
`agents/ad-types/__tests__/fragment-regression.test.ts` and `defs-skills-sync.test.ts` pin the fragment prose **verbatim** (the pore language included). Any Phase-1/4/5 change will fail them. Instruct Claude Code to **update the golden strings in the same PR** — otherwise it will either revert its own change to make tests pass, or leave you red.

---

## Copy-paste kickoff prompts for Claude Code

### Phase 1 — Skin & colour
```
Read docs/refactor/13-refactor-master-plan.md (Phase 1) and 01-issues-diagnosis.md.
Problem: our faces render over-textured (visible pores, redness) because we hard-code
pore-maximising language in 3 places: image/person-image/prompt.ts,
image/storyboard/prompt.ts + agents/ad-types/fragments/looks.ts|shared.ts, and
video/prompt.ts (ugc path).
Do:
1. Remove all pore/texture-maximising phrases on faces (list in the plan).
2. Add the per-look skin descriptors + neutral white balance + redness kill-switch from the plan.
3. Re-introduce a controlled lighting line per look family in fragments/looks.ts.
4. Update the golden strings in fragment-regression.test.ts and defs-skills-sync.test.ts.
Constraints: follow the HARD RULES in CLAUDE.md. Show me a diff; do not touch the state
machine, hooks, or video motion logic in this PR.
```

### Phase 2 — Motion contradiction
```
Read Phase 2 in the plan + 05-seedance-2.0-guide.md.
Fix: video/index.ts applies a global [renderDirective] "ONE continuous take, no cuts"
even to service, whose system prompt says "clean CUT between each" — contradictory.
Make renderDirective per-look (ugc_authentic = continuous no-cuts; cinematic_polished +
service = clean cuts; demo_clean = clean cuts, rigid product). Enforce one camera move +
one action per beat and ban "fast" in both the LLM prompt and the deterministic fallback.
Keep --camerafixed logic unchanged. Diff only video/*.
```

### Phase 3 — Clean keyframes
```
Read Phase 3. Implement Path A: keep the labelled 2×2 sheet for the UI/review, but for the
Seedance call, crop the sheet into clean panels (lib/image/crop.ts) with NO badges/caption
bars/grid, and send those. Then delete the "never render the badges/grid/caption bars"
prose from video/prompt.ts and the runtime tail. Diff image cropping + video prompt only.
```

### Phase 4 — Compression
```
Read Phase 4 + the model-return contracts table. Cut image/storyboard/prompt.ts from ~200
lines to a tight layered brief (remove duplicate restatements). Change the imagePrompt
target to 60-90 words and restructure per 03-prompting-formula-review.md. Tighten the video
prompt to <=80 words. Update golden tests. Keep the JSON output schema identical.
```

### Phase 5 — Hooks
```
Read docs/refactor/14-hooks-redesign.md. Implement all three fixes: (1) reconcile every
def's default/allowedHooks to real catalog ids + add a test that fails on any non-catalog
id; (2) rewrite compose.ts scoring to read fitsAdTypes (fit bonus + clash exclusion) and
drop the default bonus from 100 to ~20 so per-prompt confidence matters; (3) update
interpret-style/prompt.ts TASK 3 to reason per-prompt instead of preferring defaults.
Apply the recommended per-type mapping table. Update defs-skills-sync + compose tests.
```

### Later — Regenerate-on-failure + edge cases
```
Read the "Regenerate-on-failure" and "Edge-case matrix" sections of the plan. Add the
awaiting_regen soft-fail state, the retry ladder in videoBuilder, and the
POST /runs/:id/regenerate-video route (per-segment aware, reusing existing sheets).
Wire a "Regenerate clip" action in the studio UI. This is a bigger PR — plan it, then
implement in steps, and add tests for the new state transition.
```

---

## Guardrails that keep Claude Code from undoing the fix
- Keep the HARD RULES block in `CLAUDE.md` (above) — Claude Code re-reads it every session.
- Review each diff for re-introduced banned words before merging (`git grep -i "visible pores\|no skin smoothing\|full detail"` should return nothing after Phase 1).
- One phase per PR; never let it batch phases.
- Always eyeball a real render — green tests ≠ good realism.

---

## Sequencing recap
Phase 1 (skin) → Phase 2 (motion) → Phase 4 (compression) → Phase 3 (clean keyframes) → Phase 5 (hooks) → regen/edge-cases. Phases 1-2 give you the biggest visible jump and are low-risk; do them first and you'll likely see the "not realistic like Higgsfield" gap close substantially before you even touch the structural pieces.
