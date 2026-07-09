"use client";

// The /studio landing page's Template-tab content — mirrors StudioIntro's
// hero treatment (badge/heading/subtitle) so switching the sidebar tab swaps
// straight into the upload flow, no extra "New template ad" click required.

import { LayoutTemplateIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { TemplateUploadView } from "@/components/studio/template-pipeline/template-upload-view";

export function TemplateIntro() {
  return (
    <>
      <Reveal className="mb-8 text-center">
        <span className="border-border/70 bg-background/60 text-muted-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
          <LayoutTemplateIcon className="text-brand size-3.5" />
          Adverra Studio · Template
        </span>
        <h1 className="text-display text-4xl tracking-tight text-balance sm:text-5xl">
          Wrap your ad in a{" "}
          <span className="text-brand-gradient">template</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-pretty">
          Upload an After Effects template first — we check it's renderable
          before you spend anything on ad generation. Once it's ready,
          describe your ad and the agents fill the template in automatically.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <TemplateUploadView />
      </Reveal>
    </>
  );
}
