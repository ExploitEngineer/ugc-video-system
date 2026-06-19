"use client";

import type { RunDetail, Scene } from "@ugc/shared";
import { motion } from "framer-motion";
import { ClapperboardIcon, MicIcon, QuoteIcon, ZapIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** Kebab hook id → a readable label, e.g. "problem-solution" → "Problem Solution". */
function prettyHook(id: string): string {
  return id
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Readable layout of the generated script. For a 15s run it's one 4-scene list;
 * for a multi-segment run it's N labelled segments (N×4 scenes total) from
 * `segmentScenes`. Each scene shows its description + spoken line (a UGC review
 * line or inspirational voiceover, per the run's ad type).
 */
export function ScriptPanel({ run }: { run: RunDetail }) {
  // Multi-segment: prefer the per-segment grouping; fall back to the flat list.
  const segments =
    run.segmentScenes && run.segmentScenes.length > 0
      ? run.segmentScenes
      : run.scenes && run.scenes.length > 0
        ? [run.scenes]
        : null;
  if (!segments) return null;

  // Spoken (on-camera person) vs voiceover, by the resolved look family.
  const isUgc = run.lookFamily === "ugc_authentic";
  const lineLabel = isUgc ? "Spoken" : "Voiceover";
  const grouped = segments.length > 1;
  // The hook(s) open scene 1 only (Chunk F) — surface them on the first scene.
  const openingHook = run.hooks
    ? [run.hooks.visualLead.id, run.hooks.overlay?.id]
        .filter((v): v is string => Boolean(v))
        .map(prettyHook)
        .join(" + ")
    : null;

  return (
    <Card>
      <CardContent className="py-6">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ClapperboardIcon className="text-brand size-4" />
          <h2 className="text-sm font-semibold">Scene script</h2>
          <span className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {run.adTypeDisplayName}
          </span>
          {grouped && (
            <span className="border-brand/40 text-brand rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
              {segments.length * 15}s · {segments.length} segments
            </span>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {segments.map((scenes, segIdx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed ordered list (segment 0..3), never reordered
            <div key={segIdx} className="flex flex-col gap-3">
              {grouped && (
                <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
                  <span className="bg-brand/10 text-brand rounded-md px-2 py-0.5 tabular-nums">
                    Segment {segIdx + 1}
                  </span>
                  <span className="text-muted-foreground/60">
                    ~{(segIdx + 1) * 15 - 15}–{(segIdx + 1) * 15}s
                  </span>
                </div>
              )}
              <ol className="flex flex-col gap-3">
                {scenes.map((scene, i) => (
                  <SceneRow
                    key={`${segIdx}-${scene.index}-${i}`}
                    scene={scene}
                    delay={i * 0.04}
                    isUgc={isUgc}
                    lineLabel={lineLabel}
                    hook={segIdx === 0 && i === 0 ? openingHook : null}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SceneRow({
  scene,
  delay,
  isUgc,
  lineLabel,
  hook,
}: {
  scene: Scene;
  delay: number;
  isUgc: boolean;
  lineLabel: string;
  /** The opening hook label (first scene only); null otherwise. */
  hook?: string | null;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="border-border/60 bg-card/40 relative flex gap-3 rounded-xl border p-4"
    >
      <span className="bg-brand-gradient text-brand-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
        {scene.index}
      </span>
      <div className="min-w-0 flex-1">
        {hook && (
          <span className="border-brand/40 text-brand mb-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            <ZapIcon className="size-3" />
            Hook · {hook}
          </span>
        )}
        <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-x-2 text-[11px]">
          <span className="font-medium">{scene.cameraAngle}</span>
          {scene.actionMovement && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{scene.actionMovement}</span>
            </>
          )}
        </div>
        <p className="text-foreground/90 text-sm text-pretty">
          {scene.sceneDescription}
        </p>

        {scene.transcript?.trim() && (
          <div className="border-brand/30 bg-brand/5 text-foreground/90 mt-3 flex gap-2 rounded-lg border-l-2 px-3 py-2 text-sm">
            {isUgc ? (
              <QuoteIcon className="text-brand mt-0.5 size-3.5 shrink-0" />
            ) : (
              <MicIcon className="text-brand mt-0.5 size-3.5 shrink-0" />
            )}
            <span>
              <span className="text-brand mr-1.5 text-[10px] font-semibold tracking-wide uppercase">
                {lineLabel}
              </span>
              <span className="italic">“{scene.transcript.trim()}”</span>
            </span>
          </div>
        )}
      </div>
    </motion.li>
  );
}
