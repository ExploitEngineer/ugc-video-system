import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="bg-brand-gradient ring-glow relative overflow-hidden rounded-[2rem] px-6 py-16 text-center shadow-2xl shadow-brand/30 sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
            />
            <div aria-hidden className="noise-overlay absolute inset-0" />
            <h2 className="text-display text-brand-foreground relative text-4xl sm:text-5xl">
              Make your first ad video
            </h2>
            <p className="text-brand-foreground/85 relative mx-auto mt-4 max-w-xl text-pretty">
              Open the studio, drop a product image, and watch the pipeline run
              step by step.
            </p>
            <div className="relative mt-9 flex justify-center">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="group shadow-lg"
              >
                <Link href="/studio">
                  Open Studio
                  <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
