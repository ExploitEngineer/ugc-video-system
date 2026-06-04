"use client";

import type { RunDetail } from "@ugc/shared";
import { ArrowRightIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { useState } from "react";

import {
  GATE_NEXT_LABEL,
  GATE_READY_LABEL,
  gateOf,
} from "@/components/studio/run/run-meta";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackBar({
  run,
  pending,
  onSubmitFeedback,
  onCancel,
}: {
  run: RunDetail;
  pending: boolean;
  onSubmitFeedback: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState("");
  const awaiting = run.status === "awaiting_confirmation";
  const trimmed = message.trim();
  const gate = gateOf(run.currentStep);

  // ONE action: submit the typed text. Blank = continue; otherwise the backend
  // decides continue vs revise. Always allowed while awaiting.
  const submit = () => {
    if (!awaiting || pending) return;
    onSubmitFeedback(trimmed);
    setMessage("");
  };

  return (
    <div className="glass-panel sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border p-4 shadow-lg">
      <div className="text-sm">
        {awaiting && gate ? (
          <>
            <span className="font-medium">{GATE_READY_LABEL[gate]}</span>
            <span className="text-muted-foreground"> ready — describe any</span>
            <span className="text-muted-foreground">
              {" "}
              changes below, or leave it empty to continue to the{" "}
            </span>
            <span className="font-medium">{GATE_NEXT_LABEL[gate]}</span>
            <span className="text-muted-foreground"> agent.</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Step-by-step — the run pauses before each agent for your feedback.
          </span>
        )}
      </div>

      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter inserts a newline.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Describe any changes, or leave empty to continue…  (Enter to send · Shift+Enter for a new line)"
        disabled={!awaiting || pending}
        className="min-h-16 resize-none"
      />

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <XIcon className="size-4" />
          Cancel run
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={submit}
          disabled={!awaiting || pending}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : trimmed.length > 0 ? (
            <SendIcon className="size-4" />
          ) : (
            <ArrowRightIcon className="size-4" />
          )}
          {trimmed.length > 0 ? "Send" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
