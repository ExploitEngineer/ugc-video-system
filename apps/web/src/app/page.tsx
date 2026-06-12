import { CtaBand } from "@/components/landing/cta";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PipelineSection } from "@/components/landing/pipeline-section";
import { Stats } from "@/components/landing/stats";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <PipelineSection />
        <HowItWorks />
        <Features />
        <Stats />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
