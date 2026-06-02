"use client";

// Route-level error boundary for a single run view. If RunView (polling,
// rendering artifacts) throws, this renders instead of a blank screen and lets
// the user retry the failed render without a full reload.

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RunError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[studio/run] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold">
        Something went wrong with this chat
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The view hit an unexpected error. Your run is safe on the server — try
        again, or head back to the studio.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/studio">Back to studio</Link>
        </Button>
      </div>
    </div>
  );
}
