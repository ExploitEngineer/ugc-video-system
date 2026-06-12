"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRightIcon,
  ClapperboardIcon,
  ImageIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

const PIPELINE = [
  {
    icon: ImageIcon,
    label: "Reference sheets",
    caption: "Product + person, consistent views",
  },
  {
    icon: ClapperboardIcon,
    label: "Storyboard",
    caption: "Keyframes — camera, motion, beats",
  },
  {
    icon: VideoIcon,
    label: "Ad video",
    caption: "15–60s with native audio",
  },
];

const DURATIONS = ["15s", "30s", "45s", "60s"];

export function Hero() {
  const reduce = useReducedMotion();

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: EASE },
  });

  return (
    <section className="relative overflow-hidden">
      {/* Backdrop: faint dot grid + film grain. The ambient top spotlight
          comes from body::before — no heavy blurred blobs. */}
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0"
      />
      <div aria-hidden className="noise-overlay absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-6 py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-8 lg:py-32">
        {/* Left — headline lockup. */}
        <div className="flex flex-col items-start text-left">
          <motion.div
            {...fade(0)}
            className="border-border/70 bg-background/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur"
          >
            <SparklesIcon className="text-brand size-3.5" />
            Any style — UGC, cinematic, luxury, minimalist
          </motion.div>

          <motion.h1
            {...fade(0.08)}
            className="text-display mt-7 max-w-xl text-5xl leading-[1.02] tracking-tight text-balance sm:text-6xl xl:text-7xl"
          >
            One product image into a{" "}
            <span className="text-brand-gradient">finished ad video</span>
          </motion.h1>

          <motion.p
            {...fade(0.16)}
            className="text-muted-foreground mt-6 max-w-lg text-lg text-pretty"
          >
            Add a product photo and a prompt. Cooperating AI agents run an
            images → storyboard → video pipeline and hand back a finished ad
            with native audio — then fine-tune it in the built-in editor.
          </motion.p>

          <motion.div
            {...fade(0.22)}
            className="mt-6 flex flex-wrap items-center gap-2"
          >
            {DURATIONS.map((d) => (
              <span
                key={d}
                className="border-brand/30 bg-brand/10 text-brand rounded-full border px-2.5 py-1 font-mono text-xs font-medium tabular-nums"
              >
                {d}
              </span>
            ))}
            <span className="text-muted-foreground text-xs">
              pick a length · 16:9 or 9:16
            </span>
          </motion.div>

          <motion.div
            {...fade(0.28)}
            className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <Button
              asChild
              size="lg"
              variant="brand"
              className="group relative w-full overflow-hidden sm:w-auto"
            >
              <Link href="/studio">
                <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-sheen blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[520%]" />
                Open Studio
                <ArrowRightIcon className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </motion.div>

          <motion.div
            {...fade(0.36)}
            className="text-muted-foreground mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          >
            <span>Native audio</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Automatic or step-by-step</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Edit the result in the browser</span>
          </motion.div>
        </div>

        {/* Right — live pipeline preview card. */}
        <motion.div {...fade(0.2)} className="relative">
          <div
            aria-hidden
            className="bg-brand/15 absolute -top-10 -right-8 size-44 rounded-full blur-3xl"
          />
          <div className="border-gradient ring-glow relative rounded-3xl p-1.5">
            <div className="glass-panel flex flex-col gap-3 rounded-[1.4rem] p-5">
              {/* Prompt line — echoes the studio composer. */}
              <div className="border-border/60 bg-background/50 rounded-2xl border px-4 py-3">
                <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
                  Prompt
                </p>
                <p className="mt-1 text-sm">
                  “Luxury reveal of a gold watch on silk, macro detail, premium
                  feel”
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {["30s", "9:16", "Automatic"].map((chip) => (
                    <span
                      key={chip}
                      className="border-border/60 bg-background/60 text-foreground/75 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {/* The three stages, filling in sequence. */}
              {PIPELINE.map((stage, i) => (
                <div
                  key={stage.label}
                  className="border-border/60 bg-background/40 flex flex-col gap-2.5 rounded-2xl border p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-brand-gradient text-brand-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
                      <stage.icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{stage.label}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {stage.caption}
                      </p>
                    </div>
                  </div>
                  <div className="bg-border/80 h-1.5 w-full overflow-hidden rounded-full">
                    <motion.div
                      className="bg-brand-gradient h-full"
                      initial={{ width: "8%" }}
                      animate={{ width: reduce ? "100%" : ["8%", "100%"] }}
                      transition={{
                        duration: 1.5,
                        delay: 0.7 + i * 0.35,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
