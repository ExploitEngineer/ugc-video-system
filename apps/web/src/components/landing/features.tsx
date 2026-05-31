import {
  AudioLinesIcon,
  PaletteIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  WandSparklesIcon,
} from "lucide-react";

import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const FEATURES = [
  {
    icon: PaletteIcon,
    title: "Style-agnostic",
    body: "UGC, cinematic, luxury, minimalist, comedic — the agents read your intent and propagate it downstream.",
  },
  {
    icon: SlidersHorizontalIcon,
    title: "Two run modes",
    body: "Automatic for hands-off generation, or confirm-every-step to gate each artifact.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Critic auto-checks",
    body: "Every artifact is validated and regenerated on issues — in both modes.",
  },
  {
    icon: RefreshCwIcon,
    title: "Refresh-safe",
    body: "The run row is the authoritative state machine, so a page refresh never loses progress.",
  },
  {
    icon: AudioLinesIcon,
    title: "Native audio",
    body: "The video model produces one ~15s clip with built-in audio. No separate audio or merge step.",
  },
  {
    icon: WandSparklesIcon,
    title: "Consistent entities",
    body: "Reference sheets keep your product and person looking the same across every scene.",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <Reveal className="max-w-2xl">
          <p className="text-brand text-sm font-semibold tracking-wide uppercase">
            Features
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-4xl lg:text-5xl">
            Built around how the pipeline actually works
          </h2>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <RevealItem key={f.title}>
              <div className="group bg-card relative h-full overflow-hidden rounded-3xl border border-border/60 p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_60px_-24px_oklch(0.58_0.22_277/0.35)]">
                <div className="bg-accent text-accent-foreground group-hover:bg-brand-gradient group-hover:text-brand-foreground flex size-12 items-center justify-center rounded-2xl transition-colors duration-300 group-hover:scale-105">
                  <f.icon className="size-5" />
                </div>
                <h3 className="text-display mt-5 text-lg">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm text-pretty">
                  {f.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
