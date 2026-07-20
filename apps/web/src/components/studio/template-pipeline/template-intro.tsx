"use client";

// The /studio landing page's Template-tab content — mirrors StudioIntro's hero
// treatment (badge/heading/subtitle) so switching the sidebar tab reads as one
// surface.
//
// Users no longer upload templates: an admin curates a library and this tab
// becomes the picker. The grid lands in the next build step; until then this
// says so plainly rather than linking at a route that does not exist yet.

import { LayoutTemplateIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { TemplatePicker } from "@/components/studio/template-pipeline/template-picker";

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
          Pick a designed After Effects template, then describe your ad. The
          agents write the copy, design the images and generate a clip that fits
          the template exactly.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <TemplatePicker />
      </Reveal>
    </>
  );
}
