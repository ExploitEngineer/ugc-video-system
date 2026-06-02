"use client";

import type { RunDetail } from "@ugc/shared";
import { CheckIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
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
  onApprove,
  onSubmitFeedback,
  onCancel,
}: {
  run: RunDetail;
  pending: boolean;
  onApprove: () => void;
  onSubmitFeedback: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState("");
  const awaiting = run.status === "awaiting_confirmation";
  const trimmed = message.trim();
  const gate = gateOf(run.currentStep);

  // At the reference gate the user reviews the person sheet. When they uploaded
  // their own person (no generated sheet), surface that uploaded image here so
  // there is something to review (the product sheet is intentionally hidden).
  const hasGeneratedPerson = run.assets.some((a) => a.kind === "person_sheet");
  const uploadedPerson = run.assets.find((a) => a.kind === "person_upload");
  const showUploadedPerson =
    awaiting && gate === "reference" && !hasGeneratedPerson && uploadedPerson;

  const submit = () => {
    if (!awaiting || pending || trimmed.length === 0) return;
    onSubmitFeedback(trimmed);
    setMessage("");
  };

  return (
    <div className="glass-panel sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border p-4 shadow-lg">
      <div className="text-sm">
        {awaiting && gate ? (
          <>
            <span className="font-medium">{GATE_READY_LABEL[gate]}</span>
            <span className="text-muted-foreground">
              {" "}
              ready — approve to start the{" "}
            </span>
            <span className="font-medium">{GATE_NEXT_LABEL[gate]}</span>
            <span className="text-muted-foreground">
              {" "}
              agent, or describe what to change.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Step-by-step — the run pauses before each agent for your feedback.
          </span>
        )}
      </div>

      {showUploadedPerson && uploadedPerson && (
        <div className="flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: small gate thumbnail of a user upload */}
          <img
            src={uploadedPerson.url}
            alt="Uploaded person reference"
            className="border-border size-20 rounded-lg border object-cover"
          />
          <p className="text-muted-foreground text-xs">
            Your uploaded person reference. Approve to continue, or request a
            generated alternative.
          </p>
        </div>
      )}

      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl+Enter submits the feedback.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="e.g. make the person older, change the wardrobe to streetwear…"
        disabled={!awaiting || pending}
        className="min-h-16 resize-none"
      />

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <XIcon className="size-4" />
          Cancel run
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={submit}
            disabled={!awaiting || pending || trimmed.length === 0}
          >
            {pending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
            Request changes
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={onApprove}
            disabled={!awaiting || pending}
          >
            {pending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CheckIcon className="size-4" />
            )}
            Approve & continue
          </Button>
        </div>
      </div>
    </div>
  );
}
