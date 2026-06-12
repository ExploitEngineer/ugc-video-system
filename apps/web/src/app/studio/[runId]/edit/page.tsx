import type { Metadata } from "next";

import { EditVideoView } from "@/components/studio/edit/edit-video-view";

export const metadata: Metadata = {
  title: "Edit video",
  description: "Edit your generated ad video in the browser.",
};

export default async function EditRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return <EditVideoView runId={runId} />;
}
