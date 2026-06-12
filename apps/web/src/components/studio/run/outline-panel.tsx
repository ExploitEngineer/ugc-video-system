"use client";

import type { RunDetail } from "@ugc/shared";
import { motion } from "framer-motion";
import { RouteIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * The planned 60s narrative arc — the four segment summaries from the
 * `narrative_outline` step. Shown only for 60s runs once the outline lands; it
 * surfaces the continuity plan that drives every storyboard + video segment.
 */
export function OutlinePanel({ run }: { run: RunDetail }) {
  const outline = run.narrativeOutline;
  if (!outline || outline.segments.length === 0) return null;

  const segments = [...outline.segments].sort((a, b) => a.index - b.index);

  return (
    <Card>
      <CardContent className="py-6">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <RouteIcon className="text-brand size-4" />
          <h2 className="text-sm font-semibold">Story outline</h2>
          <span className="border-brand/40 text-brand rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            60s arc · {segments.length} segments
          </span>
        </div>

        <ol className="flex flex-col gap-3">
          {segments.map((seg, i) => (
            <motion.li
              key={seg.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="border-border/60 bg-card/40 relative flex gap-3 rounded-xl border p-4"
            >
              <span className="bg-brand-gradient text-brand-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
                {seg.index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px]">
                  {seg.beat && (
                    <span className="text-brand font-semibold tracking-wide uppercase">
                      {seg.beat}
                    </span>
                  )}
                  <span className="text-muted-foreground/60 tabular-nums">
                    ~{seg.index * 15}–{(seg.index + 1) * 15}s
                  </span>
                </div>
                <p className="text-foreground/90 text-sm text-pretty">
                  {seg.summary}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
