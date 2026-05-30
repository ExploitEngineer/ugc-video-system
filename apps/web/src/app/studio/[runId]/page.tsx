import type { Metadata } from "next";

import { RunView } from "@/components/studio/run/run-view";

export const metadata: Metadata = {
  title: "Run",
  description: "Watch your AI ad video run progress.",
};

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <RunView runId={runId} />
    </div>
  );
}
