"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const PIPELINE = [
  { label: "Product image", tone: "from-chart-3/30 to-chart-3/5" },
  { label: "Storyboard", tone: "from-brand/30 to-brand/5" },
  { label: "Ad video", tone: "from-brand-2/30 to-brand-2/5" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      {/* Layered backdrop: dot grid + drifting brand blobs. */}
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="bg-brand/20 pointer-events-none absolute -top-24 -left-24 size-[28rem] rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-brand-3/20 pointer-events-none absolute -top-10 right-0 size-[24rem] rounded-full blur-3xl"
      />
      {/* Film grain for cinematic depth. */}
      <div aria-hidden className="noise-overlay absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-32">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="border-border/70 bg-background/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur"
          >
            <span className="bg-brand size-1.5 animate-pulse rounded-full" />
            <SparklesIcon className="text-brand size-3.5" />
            Any style — UGC, cinematic, luxury, minimalist
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
            className="text-display mt-6 text-5xl leading-[0.95] sm:text-6xl lg:text-8xl"
          >
            One product image into a{" "}
            <span className="text-brand-gradient">finished ad video</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.14, ease: EASE }}
            className="text-muted-foreground mt-6 max-w-xl text-lg text-pretty"
          >
            Add a product photo and a prompt. Cooperating AI agents run an
            images → storyboard → video pipeline and hand back a single ~15s ad
            with native audio.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2, ease: EASE }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              variant="brand"
              className="group relative overflow-hidden"
            >
              <Link href="/studio">
                <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/30 blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[520%]" />
                Open Studio
                <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.32, ease: EASE }}
            className="text-muted-foreground mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          >
            <span>~15s with audio</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Automatic or confirm-every-step</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Refresh-safe runs</span>
          </motion.div>
        </div>

        {/* Pipeline preview card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.18, ease: EASE }}
          whileHover={reduce ? undefined : { y: -6 }}
          className="relative"
        >
          {/* glow halo behind the card */}
          <div
            aria-hidden
            className="bg-brand-gradient absolute -inset-3 -z-10 rounded-[1.75rem] opacity-25 blur-2xl"
          />
          <div className="glass-panel ring-glow relative rounded-3xl border border-border/60 p-5">
            <div className="text-muted-foreground mb-4 flex items-center justify-between text-xs">
              <span className="font-medium">Run preview</span>
              <span className="text-brand inline-flex items-center gap-1.5">
                <span className="bg-brand size-1.5 animate-pulse rounded-full" />
                generating
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {PIPELINE.map((stage, i) => (
                <motion.div
                  key={stage.label}
                  initial={{ opacity: 0, x: reduce ? 0 : -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.4 + i * 0.18,
                    ease: EASE,
                  }}
                  className={`bg-gradient-to-r ${stage.tone} flex items-center gap-3 rounded-2xl border border-border/60 p-3`}
                >
                  <span className="bg-background text-foreground flex size-8 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{stage.label}</span>
                  <div className="bg-border/80 ml-auto h-1.5 w-20 overflow-hidden rounded-full">
                    <motion.div
                      className="bg-brand-gradient h-full"
                      initial={{ width: "8%" }}
                      animate={{ width: reduce ? "100%" : ["8%", "100%"] }}
                      transition={{
                        duration: 1.4,
                        delay: 0.5 + i * 0.18,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
