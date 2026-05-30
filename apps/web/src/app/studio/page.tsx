import { SparklesIcon } from "lucide-react";
import type { Metadata } from "next";

import { Reveal } from "@/components/motion/reveal";
import { CreateRunForm } from "@/components/studio/create-run-form";

export const metadata: Metadata = {
  title: "Studio",
  description: "Create an AI ad video run.",
};

const PROMPT_IDEAS = [
  "Cinematic teaser for a matte-black water bottle, dramatic lighting, slow orbit",
  "Bright UGC unboxing of a skincare serum, handheld, upbeat",
  "Luxury reveal of a gold watch on silk, macro detail, premium feel",
];

export default function StudioPage() {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-2xl">
        <Reveal className="mb-8 text-center">
          <span className="border-border/70 bg-background/60 text-muted-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
            <SparklesIcon className="text-brand size-3.5" />
            Adverra Studio
          </span>
          <h1 className="text-display text-4xl sm:text-5xl">
            Describe your <span className="text-brand-gradient">ad video</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-pretty">
            Attach a product image, write a prompt, and press Enter. The agents
            run the images → storyboard → video pipeline for you.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <CreateRunForm />
        </Reveal>

        <Reveal delay={0.16} className="mt-6">
          <div className="flex flex-wrap justify-center gap-2">
            {PROMPT_IDEAS.map((idea) => (
              <span
                key={idea}
                className="border-border/60 bg-card/50 text-muted-foreground max-w-full truncate rounded-full border px-3 py-1 text-xs"
              >
                {idea}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
