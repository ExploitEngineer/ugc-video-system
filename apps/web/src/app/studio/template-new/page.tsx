import type { Metadata } from "next";

import { TemplateUploadView } from "@/components/studio/template-pipeline/template-upload-view";

export const metadata: Metadata = {
  title: "New template ad",
  description: "Upload an After Effects template to start a template ad.",
};

export default function TemplateNewPage() {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-lg">
        <TemplateUploadView />
      </div>
    </div>
  );
}
