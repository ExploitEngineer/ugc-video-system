"use client";

import { SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Reveal } from "@/components/motion/reveal";
import { CreateRunForm } from "@/components/studio/create-run-form";

const PROMPT_IDEAS = [
  "Cinematic teaser for a matte-black water bottle, dramatic lighting, slow orbit",
  "Bright UGC unboxing of a skincare serum, handheld, upbeat",
  "Luxury reveal of a gold watch on silk, macro detail, premium feel",
];

export function StudioIntro() {
  // Clicking a starter prompt remounts the composer with it pre-filled.
  const [seed, setSeed] = useState("");

  return (
    <>
      <Reveal className="mb-6 text-center">
        <span className="border-border/70 bg-background/60 text-muted-foreground mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
          <SparklesIcon className="text-brand size-3.5" />
          Adverra Studio
        </span>
        <h1 className="text-display text-3xl tracking-tight text-balance sm:text-4xl">
          Describe your <span className="text-brand-gradient">ad video</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-pretty">
          Attach a product image, write a prompt, and hit Enter. The agents run
          the images → storyboard → video pipeline and hand back a finished ~15s
          ad with audio.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <CreateRunForm
          key={seed}
          initialPrompt={seed}
          autoFocus={seed !== ""}
        />
      </Reveal>

      <Reveal delay={0.16} className="mt-6">
        <p className="text-muted-foreground mb-2.5 text-center text-xs font-medium">
          Need a starting point? Try one:
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {PROMPT_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setSeed(idea)}
              className="border-border/60 bg-card/50 text-muted-foreground hover:border-brand/40 hover:text-foreground hover:bg-accent/50 max-w-full truncate rounded-full border px-3 py-1.5 text-xs transition-colors duration-200"
            >
              {idea}
            </button>
          ))}
        </div>
      </Reveal>
    </>
  );
}
