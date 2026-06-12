import { Reveal } from "@/components/motion/reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What do I need to start?",
    a: "A single product image and a short prompt describing the ad you want. A person image is optional — add one when you want a face in the video, and the agents keep it consistent across scenes.",
  },
  {
    q: "How long are the videos?",
    a: "You pick: 15, 30, 45, or 60 seconds. A 15s ad is one clip; longer cuts are generated as multiple 15-second segments from one master storyboard and merged into a single video.",
  },
  {
    q: "Does the video have sound?",
    a: "Yes — speech, ambience, and sound effects are generated natively with the video itself. There is no separate audio step and nothing to sync.",
  },
  {
    q: "How much control do I have?",
    a: "Two run modes. Automatic runs end-to-end with no interruptions. Step-by-step pauses after each artifact — reference sheets, storyboard — so you can approve it or describe changes before the next agent starts.",
  },
  {
    q: "Can I edit the finished video?",
    a: "Yes. Every completed run opens in a built-in browser editor where you can trim, overlay text, and retouch. The original generated video is always kept alongside your edit.",
  },
  {
    q: "Which formats are supported?",
    a: "Landscape 16:9 for YouTube, web, and TV — or vertical 9:16 for TikTok, Reels, and Shorts. The whole pipeline, from reference sheets to the final video, renders in your chosen ratio.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-border/60">
      <div className="mx-auto w-full max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <p className="text-brand text-sm font-semibold tracking-wide uppercase">
              FAQ
            </p>
            <h2 className="text-display mt-3 text-3xl sm:text-4xl">
              Questions, answered
            </h2>
            <p className="text-muted-foreground mt-4 max-w-md text-pretty">
              The short list of things people ask before their first run. Still
              curious? The fastest answer is a 15-second test run.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <Accordion
              type="single"
              collapsible
              className="border-border/60 bg-card/40 w-full rounded-3xl border px-6 backdrop-blur"
            >
              {FAQS.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-base">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-pretty">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
