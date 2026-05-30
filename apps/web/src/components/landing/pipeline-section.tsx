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
    <section id="pipeline" className="scroll-mt-24 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-brand text-sm font-semibold">The pipeline</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Three stages, one cooperating crew of agents
          </h2>
          <p className="text-muted-foreground mt-3 text-pretty">
            A Creative Direction agent interprets your style and drives every
            step. A Critic agent validates each artifact and regenerates on
            issues — in both run modes.
          </p>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-5 md:grid-cols-3">
          {STAGES.map((stage, i) => (
            <RevealItem key={stage.title}>
              <div className="bg-card relative h-full rounded-2xl border p-6 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-lg">
                <div className="bg-brand-gradient text-brand-foreground flex size-11 items-center justify-center rounded-xl shadow-sm">
                  <stage.icon className="size-5" />
                </div>
                <div className="text-muted-foreground mt-5 text-xs font-medium">
                  Stage {i + 1}
                </div>
                <h3 className="mt-1 text-lg font-semibold">{stage.title}</h3>
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
