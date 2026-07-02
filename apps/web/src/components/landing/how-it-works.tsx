import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const STEPS = [
  {
    n: "01",
    title: "Upload + describe",
    body: "Drop a product image (person image optional) and write a prompt. Hint any ad style you want — the agents adapt.",
  },
  {
    n: "02",
    title: "Pick your options",
    body: "Choose a length (15–60s), an aspect ratio, and a run mode — automatic end-to-end, or step-by-step with your feedback at each gate.",
  },
  {
    n: "03",
    title: "Agents build artifacts",
    body: "Reference sheets → a scene script → the storyboard sheet, each step visible live as the pipeline advances.",
  },
  {
    n: "04",
    title: "Get your ad video",
    body: "The storyboard becomes your finished ad with native audio. Tweak the cut afterwards in the built-in editor.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-muted/30 relative scroll-mt-24 border-t border-border/60"
    >
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0"
      />
      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <Reveal className="max-w-2xl">
          <p className="text-brand text-sm font-semibold tracking-wide uppercase">
            How it works
          </p>
          <h2 className="text-display mt-3 text-2xl sm:text-3xl lg:text-4xl">
            From a single image to a finished ad in four moves
          </h2>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step) => (
            <RevealItem key={step.n}>
              <div className="group bg-card flex h-full gap-5 rounded-3xl border border-border/60 p-6 transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_60px_-24px_color-mix(in_oklch,var(--brand)_35%,transparent)]">
                <span className="text-brand-gradient text-display text-4xl leading-none tabular-nums transition-transform duration-300 group-hover:scale-105">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-display text-xl">{step.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm text-pretty">
                    {step.body}
                  </p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
