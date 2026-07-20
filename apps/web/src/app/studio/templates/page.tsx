import { LayoutTemplateIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { TemplatePicker } from "@/components/studio/template-pipeline/template-picker";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <Reveal className="mb-8 text-center">
        <span className="border-border/70 bg-background/60 text-muted-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
          <LayoutTemplateIcon className="text-brand size-3.5" />
          Adverra Studio · Template
        </span>
        <h1 className="text-display text-4xl tracking-tight text-balance sm:text-5xl">
          Pick a <span className="text-brand-gradient">template</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-pretty">
          Then describe your ad. The agents write the copy, design the images
          and generate a clip cut to fit the template exactly.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <TemplatePicker />
      </Reveal>
    </div>
  );
}
