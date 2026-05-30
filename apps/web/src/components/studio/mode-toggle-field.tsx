"use client";

import type { Mode } from "@ugc/shared";
import { CheckIcon, GaugeIcon, ListChecksIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  value: Mode;
  label: string;
  description: string;
  icon: typeof GaugeIcon;
}> = [
  {
    value: "automatic",
    label: "Automatic",
    description: "Runs end-to-end with no gating.",
    icon: GaugeIcon,
  },
  {
    value: "confirm",
    label: "Confirm every step",
    description: "Pause after each step to confirm or regenerate.",
    icon: ListChecksIcon,
  },
];

export function ModeToggleField({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Run mode</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              className={cn(
                "relative flex flex-col gap-1 rounded-xl border p-4 text-left transition-all",
                selected
                  ? "border-brand bg-accent/40 ring-brand/30 ring-2"
                  : "border-border hover:border-brand/40 hover:bg-accent/20",
              )}
            >
              <span className="flex items-center gap-2">
                <opt.icon
                  className={cn(
                    "size-4",
                    selected ? "text-brand" : "text-muted-foreground",
                  )}
                />
                <span className="text-sm font-semibold">{opt.label}</span>
                {selected && (
                  <span className="bg-brand-gradient text-brand-foreground ml-auto flex size-5 items-center justify-center rounded-full">
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-xs">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
