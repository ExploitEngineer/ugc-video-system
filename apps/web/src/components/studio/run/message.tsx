import { SparklesIcon, UserIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Chat-thread message shells. Purely presentational — the run view owns all
 * data/polling/mutation logic and drops content into these.
 *
 * `UserMessage` is a right-aligned brand-tinted bubble (the prompt + the
 * options the user picked). `AgentMessage` is a left-aligned, avatar-led column
 * whose children bring their own framing (cards, artifacts), so the studio
 * reads as a conversation between the user and the agents.
 */
export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="ring-glow bg-brand/10 border-brand/25 max-w-[88%] rounded-2xl rounded-tr-sm border px-4 py-3">
        {children}
      </div>
      <span
        aria-hidden
        className="bg-secondary text-secondary-foreground border-border/60 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border"
      >
        <UserIcon className="size-4" />
      </span>
    </div>
  );
}

export function AgentMessage({
  label = "Adverra",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="bg-brand-gradient text-brand-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl shadow-sm"
      >
        <SparklesIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground mb-1.5 text-xs font-medium">
          {label}
        </div>
        <div className={cn("flex flex-col gap-4", className)}>{children}</div>
      </div>
    </div>
  );
}
