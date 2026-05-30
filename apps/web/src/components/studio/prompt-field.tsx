"use client";

import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";

const MAX = 2000;

export function PromptField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          Prompt
        </label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value.length}/{MAX}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="Describe the ad. Hint a style if you like — e.g. “Cinematic teaser for a matte-black water bottle, dramatic lighting, slow orbit, premium feel.”"
        className="resize-none"
      />
      <p className="text-muted-foreground text-xs">
        A style hint is optional — the agents interpret your intent and adapt.
      </p>
    </div>
  );
}
