import { ClapperboardIcon, ImageIcon, VideoIcon } from "lucide-react";

import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const STAGES = [
  {
    icon: ImageIcon,
    title: "Images",
    body: "Product (and optional person) reference sheets generated with multiple consistent views.",
  },
  {
    icon: ClapperboardIcon,
    title: "Storyboard",
    body: "An ordered keyframe sheet — camera, motion, and scene beats in your chosen ad style.",
  },
  {
    icon: VideoIcon,
    title: "Video",
    body: "The full storyboard sheet becomes one ~15s ad with native audio. No merge step.",
  },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="scroll-mt-24 border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-brand text-sm font-semibold tracking-wide uppercase">
            The pipeline
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-4xl lg:text-5xl">
            Three stages, one cooperating crew of agents
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            A Creative Direction agent interprets your style and drives every
            step. A Critic agent validates each artifact and regenerates on
            issues — in both run modes.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 md:grid-cols-3">
          {STAGES.map((stage, i) => (
            <RevealItem key={stage.title}>
              <div className="group bg-card relative h-full overflow-hidden rounded-3xl border border-border/60 p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_60px_-24px_oklch(0.696_0.17_162/0.4)]">
                <div
                  aria-hidden
                  className="bg-brand/10 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="bg-brand-gradient text-brand-foreground flex size-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-105">
                  <stage.icon className="size-5" />
                </div>
                <div className="text-muted-foreground mt-6 font-mono text-xs font-medium tracking-widest uppercase">
                  Stage {i + 1}
                </div>
                <h3 className="text-display mt-1.5 text-xl">{stage.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm text-pretty">
                  {stage.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
