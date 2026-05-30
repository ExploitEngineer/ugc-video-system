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

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="border-border bg-background/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur"
          >
            <SparklesIcon className="text-brand size-3.5" />
            Any style — UGC, cinematic, luxury, minimalist
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-7xl"
          >
            One product image into a{" "}
            <span className="text-brand-gradient">finished ad video</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="text-muted-foreground mt-5 max-w-xl text-lg text-pretty"
          >
            Add a product photo and a prompt. Cooperating AI agents run an
            images → storyboard → video pipeline and hand back a single ~15s ad
            with native audio.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button asChild size="lg" variant="brand">
              <Link href="/studio">
                Open Studio
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-muted-foreground mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
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
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          whileHover={reduce ? undefined : { y: -4 }}
          className="glass-panel ring-glow relative rounded-2xl border p-5"
        >
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
                transition={{ duration: 0.5, delay: 0.4 + i * 0.18 }}
                className={`bg-gradient-to-r ${stage.tone} flex items-center gap-3 rounded-xl border p-3`}
              >
                <span className="bg-background text-foreground flex size-8 items-center justify-center rounded-lg border text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{stage.label}</span>
                <div className="bg-border ml-auto h-1.5 w-20 overflow-hidden rounded-full">
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
        </motion.div>
      </div>
    </section>
  );
}
