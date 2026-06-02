import type { RunDetail } from "@ugc/shared";
import {
  ClapperboardIcon,
  GaugeIcon,
  ListChecksIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";

import { STATUS_DOT, STATUS_LABEL } from "@/components/studio/run/run-meta";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RunHeader({ run }: { run: RunDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
          <span className={cn("size-2 rounded-full", STATUS_DOT[run.status])} />
          {STATUS_LABEL[run.status]}
        </span>
        <Badge variant="brand">
          <ClapperboardIcon className="size-3" />
          {run.adStyle}
        </Badge>
        <Badge variant="secondary">
          {run.adType === "ugc" ? (
            <UserIcon className="size-3" />
          ) : (
            <SparklesIcon className="size-3" />
          )}
          {run.adType === "ugc" ? "UGC" : "Inspirational"}
        </Badge>
        <Badge variant="secondary">
          {run.mode === "automatic" ? (
            <GaugeIcon className="size-3" />
          ) : (
            <ListChecksIcon className="size-3" />
          )}
          {run.mode === "automatic" ? "Automatic" : "Step-by-step"}
        </Badge>
      </div>

      <div>
        <h1 className="text-display text-2xl sm:text-3xl">Your ad run</h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-pretty">
          “{run.prompt}”
        </p>
      </div>
    </div>
  );
}
