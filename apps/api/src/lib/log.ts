// Structured, leveled logger for the API.
//
// Single-line, console-backed so it works unchanged under tsx (dev) and node
// (prod/Docker) with no extra deps. Every line carries a `scope` and optional
// structured context (`run`, `step`, `wid`, …) so you can see exactly which
// agent a run is on and where it stalled/failed. Level is gated by `LOG_LEVEL`
// (default `info`, or `debug` in development) so an idle server stays quiet.
//
// `step_events` (DB) remains the persisted, frontend-facing audit trail — this
// logger is the human-readable backend view. The two now agree.

import { env } from "../config/index.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_TAG: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

const threshold: LogLevel =
  env.LOG_LEVEL ?? (env.NODE_ENV === "development" ? "debug" : "info");

const stamp = () => new Date().toISOString().slice(11, 23);
const short = (id: string) => (id.length > 8 ? id.slice(0, 8) : id);

export type LogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Render context as ` k=v k=v` (run ids shortened); empty when nothing to show. */
function fmtCtx(ctx: LogContext): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined || v === null || v === "") continue;
    const val = k === "run" && typeof v === "string" ? short(v) : v;
    parts.push(`${k}=${val}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function emit(
  level: LogLevel,
  scope: string,
  baseCtx: LogContext,
  msg: string,
  meta?: LogContext,
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[threshold]) return;
  const ctx = fmtCtx({ ...baseCtx, ...meta });
  const line = `${stamp()} ${LEVEL_TAG[level]} [${scope}]${ctx} ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, meta?: LogContext): void;
  info(msg: string, meta?: LogContext): void;
  warn(msg: string, meta?: LogContext): void;
  error(msg: string, meta?: LogContext): void;
  /** Derive a logger with extra bound context (e.g. `.child({ step })`). */
  child(ctx: LogContext): Logger;
}

/** Create a scoped logger; `baseCtx` is merged into every line it emits. */
export function createLogger(scope: string, baseCtx: LogContext = {}): Logger {
  return {
    debug: (msg, meta) => emit("debug", scope, baseCtx, msg, meta),
    info: (msg, meta) => emit("info", scope, baseCtx, msg, meta),
    warn: (msg, meta) => emit("warn", scope, baseCtx, msg, meta),
    error: (msg, meta) => emit("error", scope, baseCtx, msg, meta),
    child: (ctx) => createLogger(scope, { ...baseCtx, ...ctx }),
  };
}

// ── Back-compat helpers ───────────────────────────────────────────────
// Used by the orchestrator + video skill. `tag` is the legacy `wid=xxxx`
// (sometimes `wid=xxxx pid=nn`) worker tag; we parse it into structured
// context so old call sites keep working and read consistently.

const runLog = createLogger("run");

function ctxFromTag(runId: string, tag?: string): LogContext {
  const ctx: LogContext = { run: runId };
  if (tag) {
    for (const pair of tag.trim().split(/\s+/)) {
      const [k, v] = pair.split("=");
      if (k && v) ctx[k] = v;
    }
  }
  return ctx;
}

/** Info line for a run, e.g. `… INF [run] run=54607891 wid=ab12 ▶ storyboard …` */
export function logRun(runId: string, msg: string, tag?: string): void {
  runLog.info(msg, ctxFromTag(runId, tag));
}

/** Error line (stderr) for a run. */
export function logRunError(runId: string, msg: string, tag?: string): void {
  runLog.error(msg, ctxFromTag(runId, tag));
}
