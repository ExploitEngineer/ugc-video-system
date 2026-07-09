import type { Metadata } from "next";
import Link from "next/link";

import { TemplateBriefForm } from "@/components/studio/template-pipeline/template-brief-form";

export const metadata: Metadata = {
  title: "New template ad",
  description: "Describe your ad — the AI fills in your template automatically.",
};

export default async function TemplateBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { templateId } = await searchParams;

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-2xl">
        {templateId ? (
          <TemplateBriefForm templateId={templateId} />
        ) : (
          <p className="text-muted-foreground text-center text-sm">
            No template selected.{" "}
            <Link href="/studio/template-new" className="text-foreground underline">
              Upload one
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
