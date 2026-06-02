# Worker & run state machine

Execution is an **in-process background worker** in `apps/api` plus **frontend polling**. The
`runs` DB row is the authoritative state — a refresh, restart, or rolling deploy never loses
progress. Files: `agents/creative-direction/worker.ts` (claim loop), `orchestrator.ts` (driver),
`plan.ts` (pipeline order), `inputs.ts` (DB input loading).

## Run statuses

```
queued ──▶ running ──┬──▶ awaiting_confirmation ──(confirm/feedback approve)──▶ running
                     │                            └──(reject/feedback revise)──▶ regenerating ──▶ running
                     ├──▶ completed   (video step done)
                     └──▶ failed      (a step threw, critic hit the regen cap, or cancelled)
```

- `queued` — created, not yet claimed.
- `running` — the worker is advancing it.
- `awaiting_confirmation` — paused at a gate (**confirm mode only**).
- `regenerating` — re-running the gated/critiqued step.
- `completed` / `failed` — terminal; the worker skips these.

## Step pipeline

Order is pure logic in `plan.ts` (`firstStep`, `nextStep`, `gateForNext`, `gateForCurrentStep`,
`genStepForRevise`):

```
product_sheet
  → person_sheet            only if NO person image was uploaded
  → product_inspection      only if criticEnabled
  → storyboard
  → storyboard_inspection   only if criticEnabled
  → video                   → completed
```

`runs.currentStep` tracks position; `step_events` is the append-only audit trail
(`started`/`passed`/`failed`/`regenerated`) the UI timeline renders.

## Gates & modes

Two gates: **reference** (after the product/person sheets) and **storyboard** (after the
storyboard sheet).

- **automatic** — no gating; the worker runs straight through to `video`.
- **confirm** — after a gated step the run pauses at `awaiting_confirmation`. The user resumes via
  `POST /runs/:id/confirm` (approve → `running`), `…/reject` (regenerate → `regenerating`), or
  `…/feedback` (free text: the Creative Direction Agent classifies approve vs revise; a revise
  stores the message in `runs.feedback` and the next regen threads it into the skill prompt).

The **critic runs in both modes** — it auto-checks sheets and may regenerate once regardless of
gating.

## The worker loop

`startWorker()` (boot, unless `WORKER_ENABLED=false`) polls every `WORKER_POLL_INTERVAL_MS`
(default 1500ms). Each `tick()`:

1. Select runs whose status is **claimable** (`queued | running | regenerating`).
2. Skip any already in this process's in-memory `inFlight` set (cheap pre-filter).
3. **Atomically claim** each via a conditional `UPDATE … SET lockedAt=now(), lockedBy=workerId
   WHERE id=? AND status claimable AND (lockedAt IS NULL OR lockedAt < now() - STALE)`. Only one
   worker wins the row; a loser logs `locked elsewhere` and skips.
4. On a win: add to `inFlight`, start a **heartbeat** (`setInterval`, 30s) that refreshes the lock
   so even a multi-minute video step stays owned, then call `driveRun(runId, workerId)`.
5. In `finally`: clear the heartbeat, remove from `inFlight`, and **release** the lock
   (`lockedAt/lockedBy = null`) so a paused→confirmed (or regenerating) run is re-claimable next tick.

Lock constants: `HEARTBEAT_MS = 30s`, `STALE_MS = 180s`. A lock older than `STALE_MS` is treated as
abandoned (dead process) and reclaimable — this is how a crashed/restarted process's runs resume.
Best-effort lock writes are logged on failure (never fatal): a missed refresh just lets the lock go
stale and be reclaimed.

## driveRun (the driver)

`driveRun` advances one run from its current state to the next stop
(`awaiting_confirmation | completed | failed`):

1. On the first transition out of `queued`, run **interpret-style** once → persist
   `adStyle`/`adType`, set `running`.
2. Loop while `running`/`regenerating`:
   - Re-read the run; exit if terminal or `awaiting_confirmation`.
   - **Fencing:** verify this worker still owns the lock (`lockedBy === workerId`) before writing —
     guards against a second driver after a stale-reclaim.
   - `regenerating` → re-run the gated step's generator (with `feedback` if present), then pause
     (confirm) or continue.
   - `running` → compute the next step, execute its skill, write step_events. If a critic returns
     `failed_retry_cap` → fail the run. If the step was `video` → complete. Otherwise, in confirm
     mode pause at the gate; else loop.

`failRun` marks the run `failed` and records a `failed` step_event (both best-effort, now logged on
failure).

## Crash resumability

Because the `runs` row holds `status` + `currentStep` and every artifact is persisted as it lands,
a restarted process re-claims in-flight runs (after the stale window) and continues from
`currentStep`. On a clean stop, the worker proactively releases the locks it holds so a restart
hands runs off immediately.

## One worker per database

The lock guarantees a single driver **per run**, but every running API instance starts its own
worker. Two instances against the **same** `DATABASE_URL` will both poll and drive runs (you'll see
two distinct `wid` values in the logs). Keep local dev on its own database, and run a single API
instance in production (or add real distributed coordination before scaling out). Set
`WORKER_ENABLED=false` to run a passive, API-only instance.
