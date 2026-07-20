"use client";

// The /studio landing page's content, driven by the sidebar's pipeline tab —
// switching tabs must update the main pane immediately, not just the "New
// chat" button's destination (that was the bug: the tab looked inert until
// the user ALSO clicked "New template ad").

import { StudioIntro } from "@/components/studio/studio-intro";
import { TemplateIntro } from "@/components/studio/template-pipeline/template-intro";
import { usePipelineTab } from "@/lib/studio-pipeline-tab";

export function StudioHome() {
  const tab = usePipelineTab();
  // Keep BOTH mounted and toggle visibility instead of conditionally
  // rendering one — a template upload in progress (registering/introspecting)
  // lives in TemplateUploadView's local state, and switching tabs away and
  // back would otherwise unmount it and lose that progress.
  return (
    <>
      <div hidden={tab !== "video"}>
        <StudioIntro />
      </div>
      <div hidden={tab !== "template"}>
        <TemplateIntro />
      </div>
    </>
  );
}
