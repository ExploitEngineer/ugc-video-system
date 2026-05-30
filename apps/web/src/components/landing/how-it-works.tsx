import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const STEPS = [
  {
    n: "01",
    title: "Upload + describe",
    body: "Drop a product image (person image optional) and write a prompt. Hint any ad style you want — the agents adapt.",
  },
  {
    n: "02",
    title: "Pick a run mode",
    body: "Automatic runs end-to-end. Confirm-every-step pauses after each artifact so you approve or regenerate.",
  },
  {
    n: "03",
    title: "Agents build artifacts",
    body: "Reference sheets → storyboard sheet, each auto-checked by the Critic agent and regenerated when needed.",
  },
  {
    n: "04",
    title: "Get your ad video",
    body: "The storyboard goes to the video agent and returns one ~15s ad with audio. Runs survive a refresh.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-muted/30 scroll-mt-24 border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
        <Reveal className="max-w-2xl">
          <p className="text-brand text-sm font-semibold">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            From a single image to a finished ad in four moves
          </h2>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step) => (
            <RevealItem key={step.n}>
              <div className="bg-card flex h-full gap-5 rounded-2xl border p-6 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-lg">
                <span className="text-brand-gradient text-3xl font-bold tabular-nums">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
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
