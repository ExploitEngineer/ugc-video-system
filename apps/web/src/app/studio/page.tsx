import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { CreateRunForm } from "@/components/studio/create-run-form";

export const metadata: Metadata = {
  title: "Studio",
  description: "Create an AI ad video run.",
};

export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <Reveal>
        <div className="mb-10">
          <p className="text-brand text-sm font-semibold">Studio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Generate an ad video
          </h1>
          <p className="text-muted-foreground mt-2 text-pretty">
            A demo of the F2 flow — the pipeline is mocked, but the run survives
            a refresh and streams its steps just like the real thing.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <CreateRunForm />
      </Reveal>
    </div>
  );
}
