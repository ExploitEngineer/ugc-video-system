"use client";

import type { RunDetail } from "@ugc/shared";
import { motion } from "framer-motion";
import { ClapperboardIcon, MicIcon, QuoteIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Readable layout of the generated 4-scene script — each scene's description
 * plus its spoken line (a UGC review line or inspirational voiceover narration,
 * depending on the run's ad type).
 */
export function ScriptPanel({ run }: { run: RunDetail }) {
  const scenes = run.scenes;
  if (!scenes || scenes.length === 0) return null;

  const isUgc = run.adType === "ugc";
  const lineLabel = isUgc ? "Spoken" : "Voiceover";

  return (
    <Card>
      <CardContent className="py-6">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ClapperboardIcon className="text-brand size-4" />
          <h2 className="text-sm font-semibold">Scene script</h2>
          <span className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {isUgc ? "UGC review" : "Inspirational"}
          </span>
        </div>

        <ol className="flex flex-col gap-3">
          {scenes.map((scene, i) => (
            <motion.li
              key={scene.index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
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
                      <span className="italic">
                        “{scene.transcript.trim()}”
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
