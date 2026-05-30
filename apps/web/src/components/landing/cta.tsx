import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="bg-brand-gradient ring-glow shadow-brand/20 relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-2xl sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]"
            />
            <h2 className="text-brand-foreground relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Make your first ad video
            </h2>
            <p className="text-brand-foreground/85 relative mx-auto mt-3 max-w-xl text-pretty">
              Open the studio, drop a product image, and watch the pipeline run
              step by step.
            </p>
            <div className="relative mt-8 flex justify-center">
              <Button asChild size="lg" variant="secondary">
                <Link href="/studio">
                  Open Studio
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
