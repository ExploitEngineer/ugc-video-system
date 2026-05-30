"use client";

import type { RunDetail } from "@ugc/shared";
import { CheckIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";

import { STEP_LABEL } from "@/components/studio/run/run-meta";
import { Button } from "@/components/ui/button";

export function ConfirmBar({
  run,
  pending,
  onConfirm,
  onReject,
  onCancel,
}: {
  run: RunDetail;
  pending: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const awaiting = run.status === "awaiting_confirmation";

  return (
    <div className="bg-card/80 sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        {awaiting ? (
          <>
            <span className="font-medium">{STEP_LABEL[run.currentStep]}</span>
            <span className="text-muted-foreground">
              {" "}
              is ready — confirm to continue or regenerate it.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Confirm mode — the run pauses after each step for your review.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <XIcon className="size-4" />
          Cancel run
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={!awaiting || pending}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RotateCcwIcon className="size-4" />
          )}
          Regenerate
        </Button>
        <Button
          variant="brand"
          size="sm"
          onClick={onConfirm}
          disabled={!awaiting || pending}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CheckIcon className="size-4" />
          )}
          Confirm
        </Button>
      </div>
    </div>
  );
}
