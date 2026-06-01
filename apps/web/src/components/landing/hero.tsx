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
  { icon: ImageIcon, label: "Product image", caption: "Reference sheets" },
  { icon: ClapperboardIcon, label: "Storyboard", caption: "Keyframe sheet" },
  { icon: VideoIcon, label: "Ad video", caption: "~15s + audio" },
];

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

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-28 text-center lg:py-36 lg:px-8">
        <motion.div
          {...fade(0)}
          className="border-border/70 bg-background/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur"
        >
          <SparklesIcon className="text-brand size-3.5" />
          Any style — UGC, cinematic, luxury, minimalist
        </motion.div>

        <motion.h1
          {...fade(0.08)}
          className="text-display mx-auto mt-7 max-w-4xl text-5xl leading-[0.98] tracking-tight text-balance sm:text-6xl lg:text-7xl"
        >
          One product image into a{" "}
          <span className="text-brand-gradient">finished ad video</span>
        </motion.h1>

        <motion.p
          {...fade(0.16)}
          className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg text-pretty"
        >
          Add a product photo and a prompt. Cooperating AI agents run an images
          → storyboard → video pipeline and hand back a single ~15s ad with
          native audio.
        </motion.p>

        <motion.div
          {...fade(0.24)}
          className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:flex-row"
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

        {/* Pipeline strip — three connected stages with a running fill. */}
        <motion.div
          {...fade(0.34)}
          className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center"
        >
          {PIPELINE.map((stage, i) => (
            <div key={stage.label} className="contents">
              <motion.div
                whileHover={reduce ? undefined : { y: -4 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="glass-panel group relative flex flex-col gap-3 rounded-2xl border border-border/60 p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-brand-gradient text-brand-foreground flex size-9 items-center justify-center rounded-xl shadow-sm">
                    <stage.icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{stage.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {stage.caption}
                    </p>
                  </div>
                </div>
                <div className="bg-border/80 h-1.5 w-full overflow-hidden rounded-full">
                  <motion.div
                    className="bg-brand-gradient h-full"
                    initial={{ width: "10%" }}
                    animate={{ width: reduce ? "100%" : ["10%", "100%"] }}
                    transition={{
                      duration: 1.6,
                      delay: 0.6 + i * 0.25,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              </motion.div>

              {i < PIPELINE.length - 1 && (
                <div
                  aria-hidden
                  className="text-muted-foreground flex items-center justify-center sm:px-1"
                >
                  <ArrowRightIcon className="hidden size-4 sm:block" />
                  <span className="bg-border h-4 w-px sm:hidden" />
                </div>
              )}
            </div>
          ))}
        </motion.div>

        <motion.div
          {...fade(0.46)}
          className="text-muted-foreground mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          <span>~15s with audio</span>
          <span className="bg-border h-1 w-1 rounded-full" />
          <span>Automatic or confirm-every-step</span>
          <span className="bg-border h-1 w-1 rounded-full" />
          <span>Refresh-safe runs</span>
        </motion.div>
      </div>
    </section>
  );
}
