import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";

const STATS = [
  {
    value: "1",
    label: "product image in",
    caption: "plus a prompt — that's the whole brief",
  },
  {
    value: "15–60s",
    label: "finished ad out",
    caption: "one clip or merged segments, native audio",
  },
  {
    value: "2",
    label: "aspect ratios",
    caption: "16:9 for web & TV, 9:16 for Reels & TikTok",
  },
  {
    value: "0",
    label: "editing tools needed",
    caption: "trim and retouch in the built-in browser editor",
  },
];

export function Stats() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-brand text-sm font-semibold tracking-wide uppercase">
            The short version
          </p>
          <h2 className="text-display mt-3 text-2xl sm:text-3xl">
            A whole production crew in one prompt
          </h2>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <RevealItem key={s.label} className="h-full">
              <div className="bg-card flex h-full flex-col gap-1 p-7">
                <span className="text-brand-gradient text-display text-3xl tabular-nums sm:text-4xl">
                  {s.value}
                </span>
                <span className="mt-1 text-sm font-semibold">{s.label}</span>
                <span className="text-muted-foreground text-xs text-pretty">
                  {s.caption}
                </span>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
