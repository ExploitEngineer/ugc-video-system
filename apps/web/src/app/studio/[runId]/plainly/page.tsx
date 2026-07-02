import type { Metadata } from "next";

import { PlainlyEditView } from "@/components/studio/plainly/plainly-edit-view";

export const metadata: Metadata = {
  title: "Customize with Plainly",
  description: "Assemble and brand your clips with a Plainly template.",
};

export default async function PlainlyPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <PlainlyEditView runId={runId} />
    </div>
  );
}
