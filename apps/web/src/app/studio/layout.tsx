import type { ReactNode } from "react";

import { StudioSidebar } from "@/components/studio/studio-sidebar";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <StudioSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
