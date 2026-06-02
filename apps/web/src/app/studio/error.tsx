"use client";

// Studio-level error boundary — catches render errors in the studio shell or
// the create-run form so the app degrades to a recoverable screen instead of a
// blank page.

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[studio] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold">The studio hit a snag</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error stopped this page from rendering. Try again, or
        return to the home page.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
