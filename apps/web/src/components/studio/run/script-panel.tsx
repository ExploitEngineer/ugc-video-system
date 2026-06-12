"use client";

import type { RunDetail, Scene } from "@ugc/shared";
import { motion } from "framer-motion";
import { ClapperboardIcon, MicIcon, QuoteIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Readable layout of the generated script. For a 15s run it's one 4-scene list;
 * for a 60s run it's four labelled segments (16 scenes total) from
 * `segmentScenes`. Each scene shows its description + spoken line (a UGC review
 * line or inspirational voiceover, per the run's ad type).
 */
export function ScriptPanel({ run }: { run: RunDetail }) {
  // 60s: prefer the per-segment grouping; fall back to the flat scene list.
  const segments =
    run.segmentScenes && run.segmentScenes.length > 0
      ? run.segmentScenes
      : run.scenes && run.scenes.length > 0
        ? [run.scenes]
        : null;
  if (!segments) return null;

  const isUgc = run.adType === "ugc";
  const lineLabel = isUgc ? "Spoken" : "Voiceover";
  const grouped = segments.length > 1;

  return (
    <Card>
      <CardContent className="py-6">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ClapperboardIcon className="text-brand size-4" />
          <h2 className="text-sm font-semibold">Scene script</h2>
          <span className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {isUgc ? "UGC review" : "Inspirational"}
          </span>
          {grouped && (
            <span className="border-brand/40 text-brand rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
              60s · {segments.length} segments
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
}: {
  scene: Scene;
  delay: number;
  isUgc: boolean;
  lineLabel: string;
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
