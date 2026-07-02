import type { Metadata } from "next";

import { StudioIntro } from "@/components/studio/studio-intro";

export const metadata: Metadata = {
  title: "Studio",
  description: "Create an AI ad video run.",
};

export default function StudioPage() {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-4xl">
        <StudioIntro />
      </div>
    </div>
  );
}
