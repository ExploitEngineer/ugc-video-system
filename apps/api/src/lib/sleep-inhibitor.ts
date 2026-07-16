// Keep the machine awake while a run is in flight.
//
// The worker is hosted on a laptop in dev, and a run takes ~20 minutes of
// mostly WAITING on providers (Seedance polls for 5+ minutes per segment).
// From the OS's point of view that is an idle machine, so the idle timer fires
// and suspends it mid-run. That is not a cosmetic problem: suspend kills every
// socket the worker holds, and the run is spending real OpenAI/BytePlus money —
// run 2b6ffa00 suspended ONE SECOND into `template_render` and failed the whole
// composite after a finished, paid 36s master had already been generated.
//
// So while any run is being driven, hold a `systemd-inhibit` block on sleep.
// logind honours a block inhibitor for an explicit `systemctl suspend` (which
// is what an idle daemon like hypridle actually calls), so the machine stays up
// until the last run finishes and the inhibitor is released.
//
// Strictly best-effort: no systemd (macOS, Windows, a container, a server that
// never sleeps) means no inhibitor and no complaint — the log line says which.
// The child is `spawn`ed detached:false with stdio ignored, so it dies with us.

import { spawn, type ChildProcess } from "node:child_process";

import { createLogger } from "./log.js";

const log = createLogger("sleep-inhibitor");

let child: ChildProcess | undefined;
/** How many runs are currently in flight — the inhibitor is a refcount, not a flag. */
let holds = 0;
/** Log the "unavailable" line once per process, not once per run. */
let warnedUnavailable = false;

/**
 * Take a hold. The inhibitor is spawned on the first one and lives until the
 * last is released. Returns a release fn that is safe to call more than once.
 */
export function inhibitSleep(why: string): () => void {
  holds++;
  if (holds === 1) start(why);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (holds === 0) stop();
  };
}

function start(why: string): void {
  if (child || warnedUnavailable) return;
  try {
    // `sleep` ONLY, deliberately not `sleep:idle`. An idle inhibitor would also
    // suppress the screen dim/lock an idle daemon owns — a security regression
    // for a 20-minute run, and far more than we need. Blocking `sleep` is
    // enough: an idle daemon suspends by calling `systemctl suspend`, and logind
    // refuses that outright while a block inhibitor is held. The screen still
    // dims and locks on its usual timers; the machine just stays powered.
    //
    // `--mode=block` refuses rather than merely delays (`delay` caps out at
    // InhibitDelayMaxSec, ~5s — useless against a 20-minute run).
    const proc = spawn(
      "systemd-inhibit",
      [
        "--what=sleep",
        "--who=ugc-api worker",
        `--why=${why}`,
        "--mode=block",
        // The inhibitor lives exactly as long as this child. `sleep infinity`
        // holds it open; killing the child releases it immediately.
        "sleep",
        "infinity",
      ],
      { stdio: "ignore" },
    );
    proc.on("error", (err) => {
      // ENOENT — no systemd on this host. Expected off Linux; never fatal.
      child = undefined;
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        log.warn(
          "cannot hold a sleep inhibitor — if this machine suspends mid-run the run can fail",
          { err: err.message },
        );
      }
    });
    child = proc;
    log.info("▶ holding a sleep inhibitor while runs are in flight", { why });
  } catch (err) {
    warnedUnavailable = true;
    log.warn("cannot hold a sleep inhibitor", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function stop(): void {
  if (!child) return;
  child.kill("SIGTERM");
  child = undefined;
  log.debug("✓ sleep inhibitor released — no runs in flight");
}

/** Drop the inhibitor on shutdown, whatever the refcount says. */
export function releaseSleepInhibitor(): void {
  holds = 0;
  stop();
}
